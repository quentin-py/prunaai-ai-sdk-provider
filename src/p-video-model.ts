import {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3CallWarning as VideoModelV3CallWarning,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';

// ──────────────────────────────────────────────────────────────
// Model ID type
// ──────────────────────────────────────────────────────────────

export type PVideoModelId = 'p-video' | 'wan-i2v' | 'wan-t2v' | 'vace' | (string & {});

// ──────────────────────────────────────────────────────────────
// Provider-level settings
// ──────────────────────────────────────────────────────────────

export interface PVideoProviderSettings {
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
   * Defaults to 120000ms (120 seconds) — longer than images due to video processing.
   */
  pollTimeoutMillis?: number;
}

// ──────────────────────────────────────────────────────────────
// Per-model settings
// ──────────────────────────────────────────────────────────────

export interface PVideoModelSettings {
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

// ──────────────────────────────────────────────────────────────
// providerOptions.pvideo shape
// ──────────────────────────────────────────────────────────────

export interface PVideoCallOptions {
  // ── Text-to-video (p-video, wan-t2v) ────────────────────
  /** Aspect ratio for output video. @default '16:9' */
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  /** Output resolution. @default '720p' */
  resolution?: '480p' | '720p';
  /** Frames per second. @default 24 for p-video, 16 for wan-t2v */
  frames_per_second?: number;
  /** Total number of frames. @default varies by model */
  num_frames?: number;
  /** Enable audio generation (p-video only). @default true */
  save_audio?: boolean;
  /** Expand prompt with LLM (p-video only). @default true */
  prompt_upsampling?: boolean;
  /** Use draft mode for faster generation (p-video only). @default false */
  draft?: boolean;
  /** Interpolate frames for smoother output. @default varies by model */
  interpolate_output?: boolean;
  /** Optimize the prompt before generation. @default false */
  optimize_prompt?: boolean;
  /** Speed mode for generation. @default varies */
  speed_mode?: string;

  // ── Image-to-video (wan-i2v) ────────────────────────────
  /** Image URL or buffer for i2v models. */
  image?: string;

  // ── LoRA parameters ──────────────────────────────────────
  /** HuggingFace URL for LoRA weights. */
  lora_scale_transformer?: number;
  /** Additional LoRA scale for transformer. */
  lora_scale_transformer_2?: number;

  // ── Shared ───────────────────────────────────────────────
  /** Seed for reproducible outputs. */
  seed?: number;
  /** Disable safety checker. @default false */
  disable_safety_checker?: boolean;
  /** Disable safety filter (alias). @default false */
  disable_safety_filter?: boolean;
  /** Fast generation mode. @default varies */
  go_fast?: boolean;
  /** Other options. */
  [key: string]: any;
}

// ──────────────────────────────────────────────────────────────
// Model implementation
// ──────────────────────────────────────────────────────────────

export class PVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'pvideo';
  readonly modelId: PVideoModelId;
  readonly maxVideosPerCall = 1;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly headers: Record<string, string>;
  private readonly pollIntervalMillis: number;
  private readonly pollTimeoutMillis: number;
  private readonly fetch: FetchFunction;

  constructor(
    modelId: PVideoModelId,
    settings: PVideoProviderSettings,
    pollIntervalMillis?: number,
    pollTimeoutMillis?: number,
  ) {
    this.modelId = modelId;
    this.baseURL = settings.baseURL ?? 'https://api.pruna.ai';
    this.fetch = settings.fetch ?? fetch;
    this.pollIntervalMillis = pollIntervalMillis ?? settings.pollIntervalMillis ?? 1000;
    this.pollTimeoutMillis = pollTimeoutMillis ?? settings.pollTimeoutMillis ?? 120000;

    this.apiKey = loadApiKey({
      apiKey: settings.apiKey,
      environmentVariableName: 'PRUNA_API_KEY',
      description: 'Pruna AI API key',
    });

    this.headers = {
      apikey: this.apiKey,
      ...settings.headers,
    };
  }

  async doGenerate(options: VideoModelV3CallOptions): Promise<{
    videos: Array<string>;
    warnings: VideoModelV3CallWarning[];
    response: { timestamp: Date; modelId: string; headers?: Record<string, string> };
  }> {

    // Build input parameters
    const input: Record<string, any> = {
      prompt: typeof options.prompt === 'string' ? options.prompt : options.prompt?.text || '',
    };

    // Handle image-to-video
    // Extract image from prompt.image (direct) or prompt.images array (from AI SDK)
    if (typeof options.prompt === 'object' && options.prompt) {
      const promptObj = options.prompt as any;
      if (promptObj.image) {
        input.image = promptObj.image;
      } else if (promptObj.images && Array.isArray(promptObj.images) && promptObj.images.length > 0) {
        input.image = promptObj.images[0];
      }
    }

    // Add video-specific options
    if (options.providerOptions?.pvideo) {
      const videoOpts = options.providerOptions.pvideo as PVideoCallOptions;

      if (videoOpts.aspect_ratio) input.aspect_ratio = videoOpts.aspect_ratio;
      if (videoOpts.resolution) input.resolution = videoOpts.resolution;
      if (videoOpts.frames_per_second) input.frames_per_second = videoOpts.frames_per_second;
      if (videoOpts.num_frames) input.num_frames = videoOpts.num_frames;
      if (videoOpts.save_audio !== undefined) input.save_audio = videoOpts.save_audio;
      if (videoOpts.prompt_upsampling !== undefined) input.prompt_upsampling = videoOpts.prompt_upsampling;
      if (videoOpts.draft !== undefined) input.draft = videoOpts.draft;
      if (videoOpts.interpolate_output !== undefined) input.interpolate_output = videoOpts.interpolate_output;
      if (videoOpts.optimize_prompt !== undefined) input.optimize_prompt = videoOpts.optimize_prompt;
      if (videoOpts.speed_mode) input.speed_mode = videoOpts.speed_mode;
      if (videoOpts.lora_scale_transformer) input.lora_scale_transformer = videoOpts.lora_scale_transformer;
      if (videoOpts.lora_scale_transformer_2) input.lora_scale_transformer_2 = videoOpts.lora_scale_transformer_2;
      if (videoOpts.seed !== undefined) input.seed = videoOpts.seed;
      if (videoOpts.disable_safety_checker !== undefined) input.disable_safety_checker = videoOpts.disable_safety_checker;
      if (videoOpts.disable_safety_filter !== undefined) input.disable_safety_filter = videoOpts.disable_safety_filter;
      if (videoOpts.go_fast !== undefined) input.go_fast = videoOpts.go_fast;
    }

    // Submit prediction with retry logic for transient 504 errors
    let lastError: Error | null = null;
    const maxRetries = 3;
    const initialDelayMs = 2000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const predictionResponse = await this.fetch(`${this.baseURL}/v1/predictions`, {
          method: 'POST',
          headers: {
            ...this.headers,
            'Model': this.modelId,
            'Try-Sync': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input }),
        });

        if (!predictionResponse.ok) {
          const error = await predictionResponse.text();

          // Retry on 504 Gateway Timeout (transient server error)
          if (predictionResponse.status === 504 && attempt < maxRetries - 1) {
            lastError = new Error(`API returned 504 (attempt ${attempt + 1}/${maxRetries}), retrying...`);
            const delayMs = initialDelayMs * Math.pow(2, attempt); // exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          throw new Error(`Pruna API prediction failed: ${predictionResponse.status} - ${error}`);
        }

        // Successfully got response, process it
        const prediction = await predictionResponse.json();
        return this.processPredictionResponse(prediction, predictionResponse);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-504 errors
        if (!lastError.message.includes('504')) {
          throw lastError;
        }

        // On last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Failed to submit prediction after retries');
  }

  private async processPredictionResponse(
    prediction: any,
    predictionResponse: any
  ): Promise<{
    videos: Array<string>;
    warnings: VideoModelV3CallWarning[];
    response: { timestamp: Date; modelId: string; headers?: Record<string, string> };
  }> {

    // Handle sync response (immediate result)
    if (prediction.status === 'succeeded' && (prediction.video_url || prediction.generation_url)) {
      const videoUrl = prediction.video_url || prediction.generation_url;
      const videoBase64 = await this.downloadVideo(videoUrl);

      return {
        videos: [videoBase64],
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: Object.fromEntries(predictionResponse.headers),
        },
      };
    }

    // Handle async response - poll for result
    if (!prediction.id) {
      // Enhanced error: show what fields are actually in the response
      const responseKeys = Object.keys(prediction).slice(0, 10);
      const responsePreview = JSON.stringify(prediction).substring(0, 200);
      throw new Error(`No prediction ID returned from API. Response keys: [${responseKeys.join(', ')}]. Response: ${responsePreview}`);
    }

    let resultPrediction = prediction;
    const startTime = Date.now();

    while (Date.now() - startTime < this.pollTimeoutMillis) {
      // Wait before polling
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMillis));

      const statusResponse = await this.fetch(
        `${this.baseURL}/v1/predictions/status/${prediction.id}`,
        {
          method: 'GET',
          headers: this.headers,
        },
      );

      if (!statusResponse.ok) {
        const error = await statusResponse.text();
        throw new Error(`Failed to poll prediction status: ${statusResponse.status} - ${error}`);
      }

      resultPrediction = await statusResponse.json();

      if (resultPrediction.status === 'succeeded') {
        break;
      }

      if (resultPrediction.status === 'failed') {
        throw new Error(`Video generation failed: ${resultPrediction.error || 'Unknown error'}`);
      }
    }

    if (resultPrediction.status !== 'succeeded') {
      throw new Error(`Video generation timed out after ${this.pollTimeoutMillis}ms`);
    }

    // Download video
    const videoUrl = resultPrediction.video_url || resultPrediction.generation_url;
    if (!videoUrl) {
      throw new Error('No video URL in response');
    }

    const videoBase64 = await this.downloadVideo(videoUrl);

    return {
      videos: [videoBase64],
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
    };
  }

  private async downloadVideo(url: string): Promise<string> {
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Convert to base64 in a portable way
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(bytes).toString('base64');
    } else {
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(str);
    }

    return base64;
  }
}

// ──────────────────────────────────────────────────────────────
// Provider factory
// ──────────────────────────────────────────────────────────────

export interface PVideoProvider {
  (modelId: PVideoModelId, settings?: PVideoModelSettings): PVideoModel;
  video(modelId: PVideoModelId, settings?: PVideoModelSettings): PVideoModel;
}

export function createPVideo(options: PVideoProviderSettings = {}): PVideoProvider {
  const baseURL = options.baseURL ?? 'https://api.pruna.ai';
  const pollIntervalMillis = options.pollIntervalMillis ?? 1000;
  const pollTimeoutMillis = options.pollTimeoutMillis ?? 120000;

  const getHeaders = (): Record<string, string> => ({
    apikey: loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'PRUNA_API_KEY',
      description: 'Pruna AI API key',
    }),
  });

  const createVideoModel = (
    modelId: PVideoModelId,
    settings?: PVideoModelSettings,
  ): PVideoModel => {
    return new PVideoModel(
      modelId,
      {
        apiKey: options.apiKey,
        baseURL,
        headers: options.headers,
        fetch: options.fetch,
        pollIntervalMillis,
        pollTimeoutMillis,
      },
      settings?.pollIntervalMillis,
      settings?.pollTimeoutMillis,
    );
  };

  return Object.assign(createVideoModel, {
    video: createVideoModel,
  });
}

/**
 * Pre-built Pruna AI video provider instance
 */
export const pVideo = createPVideo();
