#!/usr/bin/env node
/**
 * Code generator: derives model registry from prunatree P-API.json
 * Usage: node scripts/codegen.js or npm run codegen
 */

const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const API_SPEC_PATH = path.join(
  PROJECT_ROOT,
  'prunatree/services/papi/app/openapi/schemas/P-API.json'
);
const DEFAULTS_PATH = path.join(
  PROJECT_ROOT,
  'prunatree/services/papi/app/domain/model_param_defaults.json'
);
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'src/generated/model-registry.ts');

// ────────────────────────────────────────────────────────────────────
// Load and parse P-API.json and model defaults
// ────────────────────────────────────────────────────────────────────

console.log(`📖 Reading P-API spec from: ${API_SPEC_PATH}`);

if (!fs.existsSync(API_SPEC_PATH)) {
  console.error(`❌ Error: P-API.json not found at ${API_SPEC_PATH}`);
  process.exit(1);
}

const apiSpec = JSON.parse(fs.readFileSync(API_SPEC_PATH, 'utf-8'));
const schemas = apiSpec.components?.schemas || {};

// Load model defaults
let modelDefaults = {};
if (fs.existsSync(DEFAULTS_PATH)) {
  modelDefaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf-8'));
  console.log(`📖 Found ${Object.keys(modelDefaults).length} models in defaults`);
}

// Find all models with an 'input' schema
// Filter out non-model schemas (API responses, etc.)
const isModelSchema = (name) => {
  // Exclude capitalized names (API types) and known non-models
  if (name[0] === name[0].toUpperCase() && !name.includes('-')) {
    return false; // Likely an API type, not a model
  }
  return true;
};

const modelSchemas = {};
for (const [name, schema] of Object.entries(schemas)) {
  if (isModelSchema(name) && schema.properties?.input?.type === 'object') {
    modelSchemas[name] = schema.properties.input;
  }
}

console.log(`✅ Found ${Object.keys(modelSchemas).length} models with input schemas`);

// ────────────────────────────────────────────────────────────────────
// Classify each model
// ────────────────────────────────────────────────────────────────────

const imageModels = {};
const videoModels = {};

// Process models from schema first
const processedModels = new Set();

for (const [modelId, schema] of Object.entries(modelSchemas)) {
  processedModels.add(modelId);
  const required = schema.required || [];
  const properties = schema.properties || {};

  // Determine if it's a video model (check for video-specific fields)
  const hasVideoFields =
    'num_frames' in properties ||
    'src_video' in properties ||
    'frames_per_second' in properties ||
    'src_mask' in properties;

  // Determine image input requirements
  let imageField = null;
  let imageFieldIsArray = false;
  let requiresImage = false;
  let modelType = 'text-to-image';

  if ('images' in properties && required.includes('images')) {
    imageField = 'images';
    imageFieldIsArray = true;
    requiresImage = true;
  } else if ('image' in properties && required.includes('image')) {
    imageField = 'image';
    const imageSpec = properties['image'];
    // Check direct type or oneOf options
    imageFieldIsArray = imageSpec?.type === 'array' ||
      (imageSpec?.oneOf && imageSpec.oneOf.some(option => option.type === 'array'));
    requiresImage = true;
  } else if ('image' in properties && !required.includes('image')) {
    // Optional image (qwen-image in img2img mode)
    imageField = 'image';
    const imageSpec = properties['image'];
    imageFieldIsArray = imageSpec?.type === 'array' ||
      (imageSpec?.oneOf && imageSpec.oneOf.some(option => option.type === 'array'));
    requiresImage = false;
  }

  // Determine LoRA support
  const supportsLora = Object.keys(properties).some(
    (key) => key.includes('lora') || key.includes('lora_weights')
  );

  // Classify model type
  if (hasVideoFields) {
    if ('image' in properties && required.includes('image')) {
      modelType = 'image-to-video';
    } else if ('src_video' in properties) {
      modelType = 'video-processing';
    } else {
      modelType = 'text-to-video';
    }

    // Extract field metadata for better test generation and docs
    const fieldMetadata = {};
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      fieldMetadata[fieldName] = {
        description: fieldSchema.description,
        type: fieldSchema.type,
        default: fieldSchema.default,
        enum: fieldSchema.enum,
        example: fieldSchema.example,
      };
    }

    videoModels[modelId] = {
      type: modelType,
      requiresImage,
      imageField,
      ...(imageFieldIsArray && { imageFieldIsArray }),
      supportsLora,
      fields: fieldMetadata,
    };
  } else {
    // Image model
    if (requiresImage) {
      modelType = 'image-edit';
    } else {
      modelType = 'text-to-image';
    }

    // Extract field metadata for better test generation and docs
    const fieldMetadata = {};
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      fieldMetadata[fieldName] = {
        description: fieldSchema.description,
        type: fieldSchema.type,
        default: fieldSchema.default,
        enum: fieldSchema.enum,
        example: fieldSchema.example,
      };
    }

    imageModels[modelId] = {
      type: modelType,
      requiresImage,
      imageField,
      ...(imageFieldIsArray && { imageFieldIsArray }),
      supportsLora,
      fields: fieldMetadata,
    };
  }

  console.log(`  ${modelId}: ${modelType} ${supportsLora ? '(LoRA)' : ''}`);
}

// Also include models from defaults that don't have explicit schemas
// (e.g., p-video which is internal/not yet in public P-API)
for (const [modelId, defaults] of Object.entries(modelDefaults)) {
  if (processedModels.has(modelId)) continue;
  if (modelId.includes('-trainer') || modelId.startsWith('_')) continue;

  // Classify based on model name patterns and default fields
  const hasVideoFields = 'duration' in defaults || 'fps' in defaults || 'resolution' in defaults;
  const hasLora = Object.keys(defaults).some((k) => k.includes('lora'));

  let modelType = 'text-to-image';
  let requiresImage = false;
  let imageField = null;

  if (hasVideoFields) {
    modelType = 'text-to-video'; // Default to text-to-video for video models
    videoModels[modelId] = {
      type: modelType,
      requiresImage,
      imageField,
      supportsLora: hasLora,
    };
    console.log(`  ${modelId}: ${modelType} (no schema, inferred from defaults) ${hasLora ? '(LoRA)' : ''}`);
  } else {
    imageModels[modelId] = {
      type: 'text-to-image',
      requiresImage: false,
      imageField: null,
      supportsLora: hasLora,
    };
    console.log(`  ${modelId}: text-to-image (no schema, inferred from defaults) ${hasLora ? '(LoRA)' : ''}`);
  }
}

console.log(`\n📦 Summary:`);
console.log(`  Image models: ${Object.keys(imageModels).length}`);
console.log(`  Video models: ${Object.keys(videoModels).length}`);

// ────────────────────────────────────────────────────────────────────
// Generate TypeScript output
// ────────────────────────────────────────────────────────────────────

const configEntry = (config) => {
  const fieldsEntry = config.fields
    ? `, fields: ${JSON.stringify(config.fields)}`
    : '';
  const imageFieldIsArrayEntry = config.imageFieldIsArray
    ? `, imageFieldIsArray: true`
    : '';
  return `{ type: '${config.type}', requiresImage: ${config.requiresImage}, imageField: ${config.imageField ? `'${config.imageField}'` : 'null'}, supportsLora: ${config.supportsLora}${imageFieldIsArrayEntry}${fieldsEntry} }`;
};

const imageModelLines = Object.entries(imageModels)
  .map(([modelId, config]) => `  '${modelId}': ${configEntry(config)},`)
  .join('\n');

const videoModelLines = Object.entries(videoModels)
  .map(([modelId, config]) => `  '${modelId}': ${configEntry(config)},`)
  .join('\n');

const imageModelIdType = Object.keys(imageModels)
  .map((id) => `'${id}'`)
  .join(' | ');

const videoModelIdType = Object.keys(videoModels)
  .map((id) => `'${id}'`)
  .join(' | ');

const output = `/**
 * AUTO-GENERATED — DO NOT EDIT MANUALLY
 *
 * This file is generated by scripts/codegen.js from the P-API.json schema in prunatree.
 * To update, run: npm run codegen
 */

export const IMAGE_MODEL_CONFIGS = {
${imageModelLines}
} as const;

export type ImageModelId = ${imageModelIdType};

export const VIDEO_MODEL_CONFIGS = {
${videoModelLines}
} as const;

export type VideoModelId = ${videoModelIdType};

// Combined registry for easy lookup
export const MODEL_REGISTRY = {
  ...IMAGE_MODEL_CONFIGS,
  ...VIDEO_MODEL_CONFIGS,
} as const;

export type AnyModelId = ImageModelId | VideoModelId;

// Type definitions for each config value
export interface FieldMetadata {
  description?: string;
  type?: string;
  default?: any;
  enum?: any[];
  example?: any;
}

export interface ModelConfig {
  type:
    | 'text-to-image'
    | 'image-edit'
    | 'text-to-video'
    | 'image-to-video'
    | 'video-processing';
  requiresImage: boolean;
  imageField: 'image' | 'images' | null;
  imageFieldIsArray?: boolean; // True if image field expects array (e.g., qwen-image-edit-plus)
  supportsLora: boolean;
  fields?: Record<string, FieldMetadata>;
}
`;

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
console.log(`\n✨ Generated: ${OUTPUT_PATH}`);

// ────────────────────────────────────────────────────────────────────
// Generate provider implementations
// ────────────────────────────────────────────────────────────────────

console.log(`\n📝 Generating provider implementations...`);

// Generate unified ImageModel class
const imageProviderCode = `/**
 * AUTO-GENERATED — DO NOT EDIT MANUALLY
 *
 * This file is generated by scripts/codegen.js.
 * To update, run: npm run codegen
 *
 * Unified ImageModel implementation that works for all image models.
 * Model-specific behavior is read from IMAGE_MODEL_CONFIGS at runtime.
 */

import {
  ImageModelV2,
  type ImageModelV2CallOptions,
  type ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { IMAGE_MODEL_CONFIGS, type ImageModelId } from './model-registry';

export interface ImageProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
}

export interface ImageModelSettings {
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
}

export interface ImageCallOptions {
  [key: string]: any;
}

/**
 * Unified ImageModel class that supports all image generation/editing models.
 * Model-specific behavior is driven by MODEL_REGISTRY configuration.
 */
export class ImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'prunaai';
  readonly modelId: ImageModelId;
  readonly maxImagesPerCall = 1;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly headers: Record<string, string>;
  private readonly pollIntervalMillis: number;
  private readonly pollTimeoutMillis: number;
  private readonly fetch: FetchFunction;

  constructor(
    modelId: ImageModelId,
    settings: ImageProviderSettings,
    pollIntervalMillis?: number,
    pollTimeoutMillis?: number,
  ) {
    this.modelId = modelId;
    this.baseURL = settings.baseURL ?? 'https://api.pruna.ai';
    this.fetch = settings.fetch ?? fetch;
    this.pollIntervalMillis = pollIntervalMillis ?? settings.pollIntervalMillis ?? 1000;
    this.pollTimeoutMillis = pollTimeoutMillis ?? settings.pollTimeoutMillis ?? 60000;

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

  private get config() {
    return IMAGE_MODEL_CONFIGS[this.modelId];
  }

  async doGenerate(options: ImageModelV2CallOptions): Promise<{
    images: Array<string>;
    warnings: ImageModelV2CallWarning[];
    response: { timestamp: Date; modelId: string; headers?: Record<string, string> };
  }> {
    // Build request body based on model config
    const input: Record<string, any> = {};

    // Extract prompt text
    if (typeof options.prompt === 'string') {
      input.prompt = options.prompt;
    } else if (options.prompt && typeof options.prompt === 'object') {
      input.prompt = (options.prompt as any).text || '';
    }

    // Handle image input based on config (some models use 'image', others 'images')
    if (typeof options.prompt === 'object' && (options.prompt as any)?.images) {
      const images = (options.prompt as any).images;
      if (this.config.imageField === 'images') {
        // p-image-edit expects array
        input.images = images;
      } else if (this.config.imageField === 'image') {
        // qwen-image-edit-plus expects single image
        input.image = images[0];
      }
    }

    // Add provider-specific options
    if (options.providerOptions?.prunaai) {
      const opts = options.providerOptions.prunaai as ImageCallOptions;
      // Copy all provider options; Pruna API filters unknown fields
      Object.assign(input, opts);
    }

    // Submit prediction
    const predictionResponse = await this.fetch(\`\${this.baseURL}/v1/predictions\`, {
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
      throw new Error(\`Pruna API prediction failed: \${predictionResponse.status} - \${error}\`);
    }

    const prediction = await predictionResponse.json();

    // Handle sync response (immediate result)
    if (prediction.status === 'succeeded' && prediction.image_url) {
      const imageUrl = prediction.image_url;
      const imageBase64 = await this.downloadImage(imageUrl);

      return {
        images: [imageBase64],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: Object.fromEntries(predictionResponse.headers),
        },
      };
    }

    // Handle async response - poll for result
    if (!prediction.id) {
      throw new Error('No prediction ID returned from API');
    }

    let resultPrediction = prediction;
    const startTime = Date.now();

    while (Date.now() - startTime < this.pollTimeoutMillis) {
      // Wait before polling
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMillis));

      const statusResponse = await this.fetch(
        \`\${this.baseURL}/v1/predictions/status/\${prediction.id}\`,
        {
          method: 'GET',
          headers: this.headers,
        },
      );

      if (!statusResponse.ok) {
        const error = await statusResponse.text();
        throw new Error(\`Failed to poll prediction status: \${statusResponse.status} - \${error}\`);
      }

      resultPrediction = await statusResponse.json();

      if (resultPrediction.status === 'succeeded') {
        break;
      }

      if (resultPrediction.status === 'failed') {
        throw new Error(\`Image generation failed: \${resultPrediction.error || 'Unknown error'}\`);
      }
    }

    if (resultPrediction.status !== 'succeeded') {
      throw new Error(\`Image generation timed out after \${this.pollTimeoutMillis}ms\`);
    }

    // Download image
    const imageUrl = resultPrediction.image_url || resultPrediction.generation_url;
    if (!imageUrl) {
      throw new Error('No image URL in response');
    }

    const imageBase64 = await this.downloadImage(imageUrl);

    return {
      images: [imageBase64],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
    };
  }

  private async downloadImage(url: string): Promise<string> {
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(\`Failed to download image: \${response.status}\`);
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
`;

const imageProviderPath = path.join(PROJECT_ROOT, 'src/generated/providers/image-provider.ts');
const imageProviderDir = path.dirname(imageProviderPath);
if (!fs.existsSync(imageProviderDir)) {
  fs.mkdirSync(imageProviderDir, { recursive: true });
}
fs.writeFileSync(imageProviderPath, imageProviderCode, 'utf-8');
console.log(`✨ Generated: ${imageProviderPath}`);

// Generate provider factory and index
const providerIndexCode = `/**
 * AUTO-GENERATED — DO NOT EDIT MANUALLY
 *
 * This file is generated by scripts/codegen.js.
 * To update, run: npm run codegen
 */

import { ImageModel, ImageProviderSettings, ImageModelSettings } from './image-provider';
import { type ImageModelId } from './model-registry';

export interface PrunaaiProvider {
  (modelId: ImageModelId, settings?: ImageModelSettings): ImageModel;
  image(modelId: ImageModelId, settings?: ImageModelSettings): ImageModel;
}

/**
 * Create a Pruna AI provider instance with custom settings.
 *
 * @example
 * const pruna = createPrunaai({ apiKey: 'sk-...' });
 * const model = pruna('p-image');
 *
 * @param options Provider-level settings (API key, base URL, etc.)
 * @returns Provider factory function
 */
export function createPrunaai(options: ImageProviderSettings = {}): PrunaaiProvider {
  const baseURL = options.baseURL ?? 'https://api.pruna.ai';
  const pollIntervalMillis = options.pollIntervalMillis ?? 1000;
  const pollTimeoutMillis = options.pollTimeoutMillis ?? 60000;

  const createModel = (
    modelId: ImageModelId,
    settings?: ImageModelSettings,
  ): ImageModel => {
    return new ImageModel(
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

  return Object.assign(createModel, {
    image: createModel,
  });
}

/**
 * Pre-built Pruna AI provider instance with default settings.
 * Uses PRUNA_API_KEY environment variable for authentication.
 */
export const prunaai = createPrunaai();

// Re-export types and configs for convenience
export type { ImageModelId } from './model-registry';
export { IMAGE_MODEL_CONFIGS } from './model-registry';
export type { ImageModelSettings } from './image-provider';
`;

const providerIndexPath = path.join(PROJECT_ROOT, 'src/generated/providers/index.ts');
fs.writeFileSync(providerIndexPath, providerIndexCode, 'utf-8');
console.log(`✨ Generated: ${providerIndexPath}`);

// Also generate a re-export from model-registry for convenience in providers directory
const modelRegistryReExportPath = path.join(PROJECT_ROOT, 'src/generated/providers/model-registry.ts');
const modelRegistryReExport = `/**
 * Re-export of model registry for provider implementations.
 * This is a convenience re-export from ../model-registry.ts
 */
export * from '../model-registry';
`;
fs.writeFileSync(modelRegistryReExportPath, modelRegistryReExport, 'utf-8');

console.log(`\n✅ Code generation complete!`);
