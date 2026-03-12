import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

export interface PrunaProviderSettings {
  /** Pruna AI API key. Defaults to the PRUNA_AI_KEY environment variable. */
  apiKey?: string;
  /** Base URL for API calls. Defaults to https://api.pruna.ai/v1 */
  baseURL?: string;
  /** Additional headers to include on every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Model-level settings
// ---------------------------------------------------------------------------

export interface PrunaImageModelSettings {
  /** Disable the safety checker for generated images. */
  disableSafetyChecker?: boolean;
  /**
   * Upsample the prompt with an LLM before generation.
   * Corresponds to the `prompt_upsampling` field in the p-image schema.
   */
  promptUpsampling?: boolean;
}

// ---------------------------------------------------------------------------
// Supported text-to-image model IDs (Model header enum from the OpenAPI spec)
// ---------------------------------------------------------------------------

export type PrunaImageModelId =
  | 'p-image'
  | 'p-image-lora'
  | 'flux-dev'
  | 'flux-2-klein-4b'
  | 'wan-image-small'
  | 'qwen-image'
  | 'qwen-image-fast'
  | 'z-image-turbo'
  | 'z-image-turbo-lora'
  | (string & {}); // allow custom / future IDs without breaking types

// ---------------------------------------------------------------------------
// Internal API types (matching the OpenAPI spec)
// ---------------------------------------------------------------------------

interface PrunaPredictionRequest {
  input: {
    prompt: string;
    aspect_ratio?: string;
    width?: number;
    height?: number;
    seed?: number;
    prompt_upsampling?: boolean;
    disable_safety_checker?: boolean;
  };
}

interface PrunaSyncResponse {
  status: 'succeeded' | 'failed';
  generation_url?: string;
  error?: string;
}

interface PrunaAsyncResponse {
  id: string;
  model: string;
  input: Record<string, unknown>;
  get_url: string;
}

interface PrunaStatusResponse {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  generation_url?: string;
  message?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// p-image aspect_ratio enum (from schema — "custom" is the extra option
// that activates width/height; absent from the edit schema)
// ---------------------------------------------------------------------------

const GENERATION_ASPECT_RATIOS = new Set([
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'custom',
]);

// ---------------------------------------------------------------------------
// Model class
// ---------------------------------------------------------------------------

export class PrunaImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'pruna-ai';
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

  private readonly config: {
    baseURL: string;
    headers: () => Record<string, string>;
    fetch: typeof fetch;
  };
  private readonly settings: PrunaImageModelSettings;

  constructor(
    modelId: string,
    settings: PrunaImageModelSettings,
    config: {
      provider: string;
      baseURL: string;
      headers: () => Record<string, string>;
      fetch?: typeof fetch;
    },
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = {
      baseURL: config.baseURL,
      headers: config.headers,
      fetch: config.fetch ?? fetch,
    };
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: string[];
    warnings: SharedV3Warning[];
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const warnings: SharedV3Warning[] = [];
    const startTime = new Date();

    const requestBody = this.buildRequestBody(options, warnings);

    const response = await this.config.fetch(
      `${this.config.baseURL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // FIX: use modelId so callers can choose p-image-lora, flux-dev, etc.
          Model: this.modelId,
          'Try-Sync': 'true',
          ...this.config.headers(),
          ...options.headers,
        },
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pruna API error (${response.status}): ${errorText}`);
    }

    const responseHeaders = Object.fromEntries(response.headers.entries());
    const result = (await response.json()) as
      | PrunaSyncResponse
      | PrunaAsyncResponse;

    let imageUrl: string;

    if ('status' in result) {
      // Synchronous response
      if (result.status === 'failed') {
        throw new Error(
          `Pruna generation failed: ${result.error ?? 'Unknown error'}`,
        );
      }
      if (!result.generation_url) {
        throw new Error('Pruna API returned success but no generation_url');
      }
      imageUrl = result.generation_url;
    } else {
      // Asynchronous response — poll for completion
      imageUrl = await this.pollForCompletion(
        result.get_url,
        options.abortSignal,
      );
    }

    const base64 = await this.downloadImageAsBase64(
      imageUrl,
      options.abortSignal,
    );

    return {
      images: [base64],
      warnings,
      response: {
        timestamp: startTime,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildRequestBody(
    options: ImageModelV3CallOptions,
    warnings: SharedV3Warning[],
  ): PrunaPredictionRequest {
    if (!options.prompt) {
      throw new Error('Pruna requires a prompt for image generation');
    }

    const input: PrunaPredictionRequest['input'] = {
      prompt: options.prompt,
    };

    // Aspect ratio
    if (options.aspectRatio) {
      if (!GENERATION_ASPECT_RATIOS.has(options.aspectRatio)) {
        warnings.push({
          type: 'other',
          message: `Unsupported aspect_ratio "${options.aspectRatio}" for ${this.modelId}. Using default.`,
        });
      } else {
        input.aspect_ratio = options.aspectRatio;
      }
    }

    // Custom dimensions — only valid when aspect_ratio === 'custom'
    if (options.size) {
      const [width, height] = options.size.split('x').map(Number);
      if (width && height) {
        const clampedWidth = this.clampDimension(width);
        const clampedHeight = this.clampDimension(height);

        if (clampedWidth !== width || clampedHeight !== height) {
          warnings.push({
            type: 'other',
            message: `Dimensions adjusted from ${width}x${height} to ${clampedWidth}x${clampedHeight} (p-image requires 256–1440, multiples of 16).`,
          });
        }

        input.aspect_ratio = 'custom';
        input.width = clampedWidth;
        input.height = clampedHeight;
      }
    }

    // Seed
    if (options.seed !== undefined) {
      input.seed = options.seed;
    }

    // FIX: expose prompt_upsampling (present in the p-image schema)
    if (this.settings.promptUpsampling) {
      input.prompt_upsampling = true;
    }

    // Safety checker
    if (this.settings.disableSafetyChecker) {
      input.disable_safety_checker = true;
    }

    // n > 1 is not supported
    if (options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n > 1',
        details: `${this.modelId} only supports generating 1 image per call`,
      });
    }

    return { input };
  }

  private clampDimension(value: number): number {
    const clamped = Math.max(256, Math.min(1440, value));
    return Math.round(clamped / 16) * 16;
  }

  private async pollForCompletion(
    statusUrl: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const maxAttempts = 60;
    const pollInterval = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      const response = await this.config.fetch(statusUrl, {
        headers: this.config.headers(),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`Pruna status check failed: ${response.status}`);
      }

      const status = (await response.json()) as PrunaStatusResponse;

      switch (status.status) {
        case 'succeeded':
          if (!status.generation_url) {
            throw new Error(
              'Pruna API returned success but no generation_url',
            );
          }
          return status.generation_url;

        case 'failed':
          throw new Error(
            `Pruna generation failed: ${status.error ?? 'Unknown error'}`,
          );

        case 'canceled':
          throw new Error('Pruna generation was canceled');

        // FIX: 'starting' and 'processing' are both non-terminal — keep polling
        case 'starting':
        case 'processing':
          break;

        default:
          // Unknown status — keep polling rather than crashing
          break;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Pruna generation timed out after 60 seconds');
  }

  private async downloadImageAsBase64(
    url: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const response = await this.config.fetch(url, {
      headers: this.config.headers(),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export interface PrunaProvider {
  /** Create a text-to-image model (p-image, p-image-lora, flux-dev, …). */
  image(modelId: PrunaImageModelId, settings?: PrunaImageModelSettings): ImageModelV3;
  /** Alias for image() — matches AI SDK convention. */
  imageModel(modelId: PrunaImageModelId, settings?: PrunaImageModelSettings): ImageModelV3;
}

export function createPruna(options: PrunaProviderSettings = {}): PrunaProvider {
  const baseURL = options.baseURL ?? 'https://api.pruna.ai/v1';

  const getHeaders = () => ({
    apikey: loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'PRUNA_AI_KEY',
      description: 'Pruna AI API key',
    }),
    ...options.headers,
  });

  const createImageModel = (
    modelId: PrunaImageModelId,
    settings: PrunaImageModelSettings = {},
  ): ImageModelV3 =>
    new PrunaImageModel(modelId, settings, {
      provider: 'pruna-ai',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    image: createImageModel,
    imageModel: createImageModel,
  };
}

/** Default provider instance — reads PRUNA_AI_KEY from the environment. */
export const pruna = createPruna();
