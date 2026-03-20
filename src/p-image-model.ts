import {
  ImageModelV1,
  ImageModelV1CallOptions,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';

// ──────────────────────────────────────────────
// Model ID type
// ──────────────────────────────────────────────

export type PImageModelId =
  | 'p-image'
  | 'p-image-lora'
  | 'p-image-edit'
  | 'p-image-edit-lora'
  | (string & {}); // allow future model IDs without breaking types

// ──────────────────────────────────────────────
// Provider-level settings (passed to createPImage)
// ──────────────────────────────────────────────

export interface PImageProviderSettings {
  /** Pruna AI API key. Defaults to PRUNA_API_KEY env var. */
  apiKey?: string;
  /** Override the base URL. Defaults to https://api.pruna.ai */
  baseURL?: string;
  /** Additional headers sent with every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation. */
  fetch?: FetchFunction;
  /**
   * Interval in milliseconds between polling attempts.
   * Defaults to 1000ms.
   */
  pollIntervalMillis?: number;
  /**
   * Overall timeout in milliseconds for polling before giving up.
   * Defaults to 60000ms (60 seconds).
   */
  pollTimeoutMillis?: number;
}

// ──────────────────────────────────────────────
// Per-model settings (passed to pImage('model-id', settings))
// ──────────────────────────────────────────────

export interface PImageModelSettings {
  /**
   * Interval in milliseconds between polling attempts.
   * Overrides the provider-level setting for this model instance.
   */
  pollIntervalMillis?: number;
  /**
   * Overall timeout in milliseconds for polling before giving up.
   * Overrides the provider-level setting for this model instance.
   */
  pollTimeoutMillis?: number;
}

// ──────────────────────────────────────────────
// providerOptions.pimage shape
//
// All fields are optional. Only fields that belong to the target model
// are included in the request — Pruna enforces additionalProperties: false
// on every model schema, so sending unknown fields causes a 400.
// ──────────────────────────────────────────────

export interface PImageCallOptions {
  // ── Generation (p-image, p-image-lora) ──────
  /** Output width in pixels (256–1440, multiple of 16). Requires aspect_ratio='custom'. */
  width?: number;
  /** Output height in pixels (256–1440, multiple of 16). Requires aspect_ratio='custom'. */
  height?: number;
  /**
   * Aspect ratio for generation models.
   * Automatically set to 'custom' when width/height are provided.
   * @default '16:9'
   */
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | 'custom';
  /** Expand the prompt with an LLM before generation. @default false */
  prompt_upsampling?: boolean;

  // ── Edit (p-image-edit, p-image-edit-lora) ──
  /**
   * Aspect ratio for edit models. 'match_input_image' preserves the source image ratio.
   * @default 'match_input_image'
   */
  edit_aspect_ratio?:
    | 'match_input_image'
    | '1:1'
    | '16:9'
    | '9:16'
    | '4:3'
    | '3:4'
    | '3:2'
    | '2:3';
  /**
   * Faster generation. Disable for complex editing tasks.
   * @default true
   */
  turbo?: boolean;

  // ── LoRA (p-image-lora, p-image-edit-lora) ──
  /**
   * HuggingFace URL for LoRA weights.
   * Format: huggingface.co/<owner>/<model>[/<file.safetensors>]
   */
  lora_weights?: string;
  /**
   * LoRA influence scale (−1 to 3).
   * @default 1
   */
  lora_scale?: number;
  /** HuggingFace API token for private LoRA repos. */
  hf_api_token?: string;

  // ── Shared ───────────────────────────────────
  /** Disable the safety checker. @default false */
  disable_safety_checker?: boolean;
}

// ──────────────────────────────────────────────
// Internal API types — sourced from Pruna OpenAPI spec v0.3.0
// Reference: https://docs.api.pruna.ai/
// ──────────────────────────────────────────────

/**
 * All Pruna model requests wrap the payload in an `input` key.
 * Schema: { input: { prompt, ...modelFields } }
 */
interface PredictionRequestBody {
  input: {
    prompt: string;
    seed?: number;
    disable_safety_checker?: boolean;
    // generation only
    width?: number;
    height?: number;
    aspect_ratio?: string;
    prompt_upsampling?: boolean;
    // edit only
    images?: string[]; // URLs only — raw buffers must be uploaded first
    turbo?: boolean;
    // lora (generation + edit variants)
    lora_weights?: string;
    lora_scale?: number;
    hf_api_token?: string;
  };
}

/**
 * Async creation response (default, or Try-Sync timed out).
 * Use `id` to poll /v1/predictions/status/{id}.
 */
interface AsyncPredictionResponse {
  id: string;
  model: string;
  input: Record<string, unknown>;
  get_url: string;
}

/**
 * Sync success response (Try-Sync: true and completed within 60s).
 */
interface SyncSuccessResponse {
  status: 'succeeded';
  generation_url: string;
}

/**
 * Status poll response from GET /v1/predictions/status/{id}.
 */
interface PredictionStatusResponse {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  generation_url?: string;
  message?: string;
  error?: string;
}

/**
 * File upload response from POST /v1/files.
 */
interface FileUploadResponse {
  id: string;
  urls: { get: string };
}

// ──────────────────────────────────────────────
// Main model class
// ──────────────────────────────────────────────

export class PImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';
  readonly modelId: PImageModelId;

  private readonly settings: PImageModelSettings;
  private readonly config: {
    provider: string;
    baseURL: string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
    pollIntervalMillis: number;
    pollTimeoutMillis: number;
  };

  constructor(
    modelId: PImageModelId,
    settings: PImageModelSettings,
    config: {
      provider: string;
      baseURL: string;
      headers: () => Record<string, string>;
      fetch?: FetchFunction;
      pollIntervalMillis: number;
      pollTimeoutMillis: number;
    },
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return 1;
  }

  // ── Private helpers ────────────────────────

  private get isEdit(): boolean {
    return this.modelId.includes('edit');
  }

  private get isLora(): boolean {
    return this.modelId.includes('lora');
  }

  private getRequestHeaders(): Record<string, string> {
    return {
      ...this.config.headers(),
      Model: this.modelId,
      'Content-Type': 'application/json',
    };
  }

  private get effectivePollIntervalMillis(): number {
    return this.settings.pollIntervalMillis ?? this.config.pollIntervalMillis;
  }

  private get effectivePollTimeoutMillis(): number {
    return this.settings.pollTimeoutMillis ?? this.config.pollTimeoutMillis;
  }

  /**
   * Upload a raw image buffer to POST /v1/files.
   * Returns the CDN URL to use in prediction inputs.
   * Uploaded files expire after 30 minutes.
   */
  private async uploadFile(
    imageBuffer: Uint8Array,
    mimeType: string,
  ): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([imageBuffer as BlobPart], { type: mimeType });
    formData.append('content', blob, `upload.${mimeType.split('/')[1] ?? 'png'}`);

    const fetchFn = this.config.fetch ?? fetch;
    const response = await fetchFn(`${this.config.baseURL}/v1/files`, {
      method: 'POST',
      headers: this.config.headers(), // no Content-Type — multipart boundary is set by fetch
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`File upload failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as FileUploadResponse;
    return data.urls.get;
  }

  /**
   * Resolve all prompt images to URL strings suitable for the Pruna API.
   * The Pruna `images` field is format: uri — only URLs are accepted.
   * Raw buffers (Uint8Array / ArrayBuffer) are uploaded via POST /v1/files.
   */
  private async resolveImageUrls(
    prompt: ImageModelV1CallOptions['prompt'],
  ): Promise<string[]> {
    if (!prompt || typeof prompt === 'string') return [];

    const images =
      (prompt as { images?: Array<string | Uint8Array | ArrayBuffer> }).images ?? [];
    const urls: string[] = [];

    for (const img of images) {
      if (typeof img === 'string') {
        // Already a URL — pass through directly
        urls.push(img);
      } else {
        // Raw buffer — must upload to Pruna file storage
        const buffer =
          img instanceof Uint8Array ? img : new Uint8Array(img as ArrayBuffer);
        const url = await this.uploadFile(buffer, 'image/png');
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * Build the correct request body for this model type.
   *
   * Critical: Pruna enforces `additionalProperties: false` on every model schema.
   * Sending a field that doesn't belong to the target model causes a 400 error.
   * The branching here ensures only valid fields are sent.
   *
   * All Pruna requests are wrapped: { input: { ...fields } }
   */
  private buildRequestBody(
    promptText: string,
    options: ImageModelV1CallOptions,
    resolvedImages: string[],
  ): PredictionRequestBody {
    const po = (options.providerOptions?.pimage ?? {}) as PImageCallOptions;

    // seed: top-level generateImage() param takes precedence
    const seed = options.seed;

    const baseInput = {
      prompt: promptText,
      ...(seed !== undefined && { seed }),
      ...(po.disable_safety_checker !== undefined && {
        disable_safety_checker: po.disable_safety_checker,
      }),
    };

    // LoRA fields — valid on both p-image-lora and p-image-edit-lora
    const loraFields = this.isLora
      ? {
          ...(po.lora_weights !== undefined && { lora_weights: po.lora_weights }),
          ...(po.lora_scale !== undefined && { lora_scale: po.lora_scale }),
          ...(po.hf_api_token !== undefined && { hf_api_token: po.hf_api_token }),
        }
      : {};

    if (this.isEdit) {
      // ── Edit schema (p-image-edit, p-image-edit-lora) ─────────────
      // Valid fields: prompt, seed, turbo, images, aspect_ratio,
      //               disable_safety_checker, + lora fields for edit-lora
      // INVALID (causes 400): width, height, prompt_upsampling

      const aspectRatio =
        po.edit_aspect_ratio ??
        (options.aspectRatio as PImageCallOptions['edit_aspect_ratio']) ??
        'match_input_image';

      return {
        input: {
          ...baseInput,
          aspect_ratio: aspectRatio,
          images: resolvedImages,
          ...(po.turbo !== undefined && { turbo: po.turbo }),
          ...loraFields,
        },
      };
    } else {
      // ── Generation schema (p-image, p-image-lora) ──────────────────
      // Valid fields: prompt, seed, width, height, aspect_ratio,
      //               prompt_upsampling, disable_safety_checker,
      //               lora_weights, lora_scale, hf_api_token
      // INVALID (causes 400): images, turbo

      // Derive dimensions: providerOptions > size string
      let width = po.width;
      let height = po.height;

      if (options.size) {
        const [w, h] = options.size.split('x').map(Number);
        if (w && h) {
          if (po.width === undefined) width = w;
          if (po.height === undefined) height = h;
        }
      }

      // aspect_ratio must be 'custom' when explicit dimensions are set
      let aspectRatio: string =
        po.aspect_ratio ??
        (options.aspectRatio as string) ??
        '16:9';

      if (width !== undefined || height !== undefined) {
        aspectRatio = 'custom';
      }

      return {
        input: {
          ...baseInput,
          aspect_ratio: aspectRatio,
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
          ...(po.prompt_upsampling !== undefined && {
            prompt_upsampling: po.prompt_upsampling,
          }),
          ...loraFields,
        },
      };
    }
  }

  /**
   * Poll GET /v1/predictions/status/{id} until succeeded, failed, or timeout.
   * Returns the generation_url on success.
   */
  private async pollForResult(
    predictionId: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const fetchFn = this.config.fetch ?? fetch;
    const intervalMs = this.effectivePollIntervalMillis;
    const deadline = Date.now() + this.effectivePollTimeoutMillis;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, intervalMs));

      if (abortSignal?.aborted) {
        throw new Error('Image generation aborted');
      }

      const response = await fetchFn(
        `${this.config.baseURL}/v1/predictions/status/${predictionId}`,
        {
          headers: this.config.headers(),
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Status poll failed (${response.status}): ${text}`);
      }

      const status = (await response.json()) as PredictionStatusResponse;

      switch (status.status) {
        case 'succeeded':
          if (!status.generation_url) {
            throw new Error('Prediction succeeded but generation_url is missing');
          }
          return status.generation_url;

        case 'failed':
          throw new Error(`Prediction failed: ${status.error ?? status.message ?? 'unknown error'}`);

        case 'canceled':
          throw new Error('Prediction was canceled');

        case 'starting':
        case 'processing':
          break; // continue polling
      }
    }

    throw new Error(
      `Prediction timed out after ${this.effectivePollTimeoutMillis}ms`,
    );
  }

  // ── Main doGenerate ────────────────────────

  async doGenerate(options: ImageModelV1CallOptions): Promise<{
    images: Array<string>;
    warnings: ImageModelV1CallWarning[];
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    const warnings: ImageModelV1CallWarning[] = [];
    const po = (options.providerOptions?.pimage ?? {}) as PImageCallOptions;

    // Warn on model/param mismatches
    if (!this.isEdit && po.turbo !== undefined) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is a generation model — turbo parameter is ignored`,
      });
    }

    if (!this.isEdit && po.edit_aspect_ratio !== undefined) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is a generation model — edit_aspect_ratio parameter is ignored`,
      });
    }

    if (this.isEdit && po.width !== undefined) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is an edit model — width parameter is ignored`,
      });
    }

    if (this.isEdit && po.height !== undefined) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is an edit model — height parameter is ignored`,
      });
    }

    if (this.isEdit && po.prompt_upsampling !== undefined) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is an edit model — prompt_upsampling parameter is ignored`,
      });
    }

    if (this.isLora && !po.lora_weights) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} requires lora_weights in providerOptions.pimage`,
      });
    }

    // Resolve prompt text
    const promptText =
      typeof options.prompt === 'string'
        ? options.prompt
        : (options.prompt as { text?: string }).text ?? '';

    // Upload raw buffers for edit models — Pruna only accepts URLs in the images field
    const resolvedImages = this.isEdit
      ? await this.resolveImageUrls(options.prompt)
      : [];

    if (this.isEdit && resolvedImages.length === 0) {
      warnings.push({
        type: 'other',
        message: `${this.modelId} is an edit model but no input images were provided`,
      });
    }

    const body = this.buildRequestBody(promptText, options, resolvedImages);
    const fetchFn = this.config.fetch ?? fetch;

    // Submit prediction — Try-Sync: true asks Pruna to wait up to 60s for completion
    const predictionResponse = await fetchFn(`${this.config.baseURL}/v1/predictions`, {
      method: 'POST',
      headers: {
        ...this.getRequestHeaders(),
        'Try-Sync': 'true',
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!predictionResponse.ok) {
      const text = await predictionResponse.text();
      throw new Error(`Prediction request failed (${predictionResponse.status}): ${text}`);
    }

    // Capture response headers for telemetry
    const responseHeaders: Record<string, string> = {};
    predictionResponse.headers?.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const json = await predictionResponse.json();

    let generationUrl: string;

    if ('status' in json && json.status === 'succeeded') {
      // Sync success: { status: 'succeeded', generation_url: '...' }
      const syncResponse = json as SyncSuccessResponse;
      if (!syncResponse.generation_url) {
        throw new Error('Sync response missing generation_url');
      }
      generationUrl = syncResponse.generation_url;
    } else if ('id' in json) {
      // Async response: { id, model, input, get_url }
      // Poll until complete
      const asyncResponse = json as AsyncPredictionResponse;
      generationUrl = await this.pollForResult(asyncResponse.id, options.abortSignal);
    } else {
      throw new Error(`Unexpected response from Pruna API: ${JSON.stringify(json)}`);
    }

    // Download the generated image and convert to base64
    const imgResponse = await fetchFn(generationUrl, {
      signal: options.abortSignal,
    });

    if (!imgResponse.ok) {
      throw new Error(
        `Failed to download generated image (${imgResponse.status}): ${generationUrl}`,
      );
    }

    const buffer = await imgResponse.arrayBuffer();
    // Convert to base64 in a portable way (works in Node.js, Edge Runtime, browsers)
    const bytes = new Uint8Array(buffer);
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      // Node.js
      base64 = Buffer.from(bytes).toString('base64');
    } else {
      // Edge Runtime, browsers
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(str);
    }

    return {
      images: [base64],
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
      },
    };
  }
}

// ──────────────────────────────────────────────
// Provider factory
// ──────────────────────────────────────────────

export interface PImageProvider {
  (modelId: PImageModelId, settings?: PImageModelSettings): PImageModel;
  image(modelId: PImageModelId, settings?: PImageModelSettings): PImageModel;
}

export function createPImage(
  options: PImageProviderSettings = {},
): PImageProvider {
  const baseURL = options.baseURL ?? 'https://api.pruna.ai';
  const pollIntervalMillis = options.pollIntervalMillis ?? 1000;
  const pollTimeoutMillis = options.pollTimeoutMillis ?? 60000;

  const getHeaders = (): Record<string, string> => ({
    apikey: loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'PRUNA_API_KEY',
      description: 'Pruna AI API key',
    }),
    ...options.headers,
  });

  const createModel = (
    modelId: PImageModelId,
    modelSettings: PImageModelSettings = {},
  ): PImageModel =>
    new PImageModel(modelId, modelSettings, {
      provider: 'pimage',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      pollIntervalMillis,
      pollTimeoutMillis,
    });

  const provider = (
    modelId: PImageModelId,
    modelSettings?: PImageModelSettings,
  ) => createModel(modelId, modelSettings);

  provider.image = (
    modelId: PImageModelId,
    modelSettings?: PImageModelSettings,
  ) => createModel(modelId, modelSettings);

  return provider as PImageProvider;
}

/** Default provider instance — reads API key from PRUNA_API_KEY env var. */
export const pImage = createPImage();
