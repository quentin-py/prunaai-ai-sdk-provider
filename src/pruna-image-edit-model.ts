import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

export interface PrunaEditProviderSettings {
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

export interface PrunaEditImageModelSettings {
  /** Disable the safety checker for generated images. */
  disableSafetyChecker?: boolean;
  /**
   * Run the model with additional speed optimisations.
   * Turn off for complex or detailed editing tasks.
   * Corresponds to the `turbo` field in the p-image-edit schema.
   * @default true
   */
  turbo?: boolean;
}

// ---------------------------------------------------------------------------
// Supported image-editing model IDs (from the OpenAPI spec Model header enum)
// ---------------------------------------------------------------------------

export type PrunaEditModelId =
  | 'p-image-edit'
  | 'p-image-edit-lora'
  | 'qwen-image-edit-plus'
  | 'flux-dev-lora'
  | (string & {}); // allow custom / future IDs without breaking types

// ---------------------------------------------------------------------------
// Extended call options
// ---------------------------------------------------------------------------

/**
 * Call options for the edit provider.
 *
 * `referenceImages` must be either:
 *   - Pruna file URLs already uploaded via `POST /v1/files`  (fast path), OR
 *   - raw binary `Uint8Array` / base64 `string` blobs that the provider will
 *     upload automatically before submitting the prediction.
 *
 * Between 1 and 5 images are accepted (API constraint).
 */
export interface PrunaEditCallOptions extends ImageModelV3CallOptions {
  referenceImages?: Array<string | Uint8Array>;
}

// ---------------------------------------------------------------------------
// Internal API types (matching the OpenAPI spec)
// ---------------------------------------------------------------------------

interface PrunaEditPredictionRequest {
  input: {
    prompt: string;
    images: string[]; // Must be Pruna file URLs (uri format)
    aspect_ratio?: string;
    seed?: number;
    turbo?: boolean;
    disable_safety_checker?: boolean;
    // NOTE: width/height do NOT exist on p-image-edit — omitted intentionally.
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

interface PrunaFileUploadResponse {
  id: string;
  name: string;
  content_type: string;
  size: number;
  created_at: string;
  expires_at: string;
  urls: {
    get: string; // Use this URL in the images[] array
  };
}

// ---------------------------------------------------------------------------
// Valid aspect ratios for the edit schema (no "custom", no width/height)
// ---------------------------------------------------------------------------

const EDIT_ASPECT_RATIOS = new Set([
  'match_input_image',
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
]);

// ---------------------------------------------------------------------------
// Model class
// ---------------------------------------------------------------------------

export class PrunaEditImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'pruna-ai';
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

  private readonly config: {
    baseURL: string;
    headers: () => Record<string, string>;
    fetch: typeof fetch;
  };
  private readonly settings: PrunaEditImageModelSettings;

  constructor(
    modelId: string,
    settings: PrunaEditImageModelSettings,
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

  async doGenerate(options: PrunaEditCallOptions): Promise<{
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

    if (!options.prompt) {
      throw new Error('Pruna Edit requires a prompt');
    }

    const rawImages = options.referenceImages ?? [];
    if (rawImages.length === 0) {
      throw new Error(
        'Pruna Edit requires at least one reference image. ' +
        'For text-to-image generation, use the p-image provider instead.',
      );
    }
    if (rawImages.length > 5) {
      throw new Error('Pruna Edit accepts at most 5 reference images.');
    }

    // FIX: upload any non-URL blobs; reuse values that are already Pruna URLs
    const imageUrls = await this.resolveImageUrls(rawImages);

    const requestBody = this.buildRequestBody(options, imageUrls, warnings);

    const response = await this.config.fetch(
      `${this.config.baseURL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // FIX: use modelId so callers can choose p-image-edit-lora, etc.
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

  /**
   * Upload any raw blobs to /v1/files and return an array of Pruna file URLs.
   * Values that already look like a Pruna file URL are passed through untouched.
   */
  private async resolveImageUrls(
    images: Array<string | Uint8Array>,
  ): Promise<string[]> {
    return Promise.all(
      images.map(image => {
        if (typeof image === 'string' && image.startsWith('https://')) {
          // Already a URL — assume the caller uploaded it (or it's a public URL)
          return Promise.resolve(image);
        }
        return this.uploadFile(image);
      }),
    );
  }

  /**
   * Upload a single image blob to POST /v1/files.
   * Returns the `urls.get` value from the FileUploadResponse.
   *
   * Files expire 30 minutes after upload (per API spec).
   */
  private async uploadFile(image: string | Uint8Array): Promise<string> {
    let blob: Blob;

    if (typeof image === 'string') {
      // Treat as base64-encoded image data
      const binary = Buffer.from(image, 'base64');
      blob = new Blob([binary], { type: 'image/jpeg' });
    } else {
      blob = new Blob([image], { type: 'image/jpeg' });
    }

    const formData = new FormData();
    formData.append('content', blob, 'image.jpg');

    const response = await this.config.fetch(`${this.config.baseURL}/files`, {
      method: 'POST',
      headers: {
        // Do NOT set Content-Type here — fetch sets it automatically with the
        // correct multipart boundary when the body is FormData.
        ...this.config.headers(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Pruna file upload failed (${response.status}): ${errorText}`,
      );
    }

    const uploaded = (await response.json()) as PrunaFileUploadResponse;
    return uploaded.urls.get;
  }

  private buildRequestBody(
    options: PrunaEditCallOptions,
    imageUrls: string[],
    warnings: SharedV3Warning[],
  ): PrunaEditPredictionRequest {
    const input: PrunaEditPredictionRequest['input'] = {
      prompt: options.prompt!,
      images: imageUrls,
    };

    // Aspect ratio — edit model uses a different enum (no "custom")
    if (options.aspectRatio) {
      if (!EDIT_ASPECT_RATIOS.has(options.aspectRatio)) {
        warnings.push({
          type: 'other',
          message:
            `Unsupported aspect_ratio "${options.aspectRatio}" for ${this.modelId}. ` +
            `Valid values: ${[...EDIT_ASPECT_RATIOS].join(', ')}. Using default.`,
        });
      } else {
        input.aspect_ratio = options.aspectRatio;
      }
    }

    // FIX: 'size' (width/height) does not exist in the p-image-edit schema.
    // Emit a warning instead of silently sending invalid fields.
    if (options.size) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          `${this.modelId} does not support explicit width/height. ` +
          'Use the aspect_ratio option instead.',
      });
    }

    // Seed
    if (options.seed !== undefined) {
      input.seed = options.seed;
    }

    // FIX: expose turbo (present in the p-image-edit schema, defaults to true)
    if (this.settings.turbo !== undefined) {
      input.turbo = this.settings.turbo;
    }

    // Safety checker
    if (this.settings.disableSafetyChecker) {
      input.disable_safety_checker = true;
    }

    // n > 1 is not supported
    if (options.n && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n > 1',
        details: `${this.modelId} only supports generating 1 image per call`,
      });
    }

    return { input };
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

export interface PrunaEditProvider {
  /** Create an image-editing model (p-image-edit, p-image-edit-lora, …). */
  image(modelId: PrunaEditModelId, settings?: PrunaEditImageModelSettings): ImageModelV3;
  /** Alias for image() — matches AI SDK convention. */
  imageModel(modelId: PrunaEditModelId, settings?: PrunaEditImageModelSettings): ImageModelV3;
}

export function createPrunaEdit(
  options: PrunaEditProviderSettings = {},
): PrunaEditProvider {
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
    modelId: PrunaEditModelId,
    settings: PrunaEditImageModelSettings = {},
  ): ImageModelV3 =>
    new PrunaEditImageModel(modelId, settings, {
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
export const prunaEdit = createPrunaEdit();
