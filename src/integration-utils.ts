import * as fs from 'node:fs';
import * as path from 'node:path';
import { MODEL_REGISTRY } from './generated/model-registry';

export const TEST_API_KEY = process.env.PRUNA_API_KEY;
export const TEST_BASE_URL = process.env.PRUNA_BASE_URL ?? 'https://api.pruna.ai';

// Public test fixtures (no user secrets needed beyond PRUNA_API_KEY)
export const TEST_PROMPT = 'A serene mountain lake at dawn, photorealistic, 4k';
// Using a simple image from a permissive CDN (Wikimedia blocks external requests)
export const TEST_IMAGE_URL = 'https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg';
export const TEST_LORA_URL = 'https://huggingface.co/pruna-ai/test-lora';

export interface ModelEntry {
  modelId: string;
  schema?: Record<string, any>;
  defaults: Record<string, any>;
}

export interface TestResult {
  modelId: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  request: { prompt: string | { text: string; images: string[] }; params: Record<string, any> };
  response?: {
    image_size_bytes: number;
    image_base64_prefix: string;
    is_valid_png: boolean;
    warnings: any[];
  };
  error?: string | null;
  prunatree_schema_fields?: string[];
}

// In-memory store for test metadata (read by the JSON reporter)
const testResults = new Map<string, TestResult>();

export function recordTestResult(testName: string, data: TestResult): void {
  testResults.set(testName, data);
}

export function getTestResults(): Map<string, TestResult> {
  return new Map(testResults);
}

/**
 * Load Pruna model definitions from prunatree schemas
 * Reads P-API.json (OpenAPI spec) and model_param_defaults.json
 */
export function loadPrunaTreeModels(): ModelEntry[] {
  const projectRoot = path.resolve(__dirname, '..');
  const schemaPath = path.join(projectRoot, 'prunatree/services/papi/app/openapi/schemas/P-API.json');
  const defaultsPath = path.join(projectRoot, 'prunatree/services/papi/app/domain/model_param_defaults.json');

  let apiSpec: any = {};
  let defaults: Record<string, any> = {};

  try {
    if (fs.existsSync(schemaPath)) {
      apiSpec = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`Could not load P-API.json from ${schemaPath}:`, err);
  }

  try {
    if (fs.existsSync(defaultsPath)) {
      defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`Could not load model_param_defaults.json from ${defaultsPath}:`, err);
  }

  // Extract schemas from OpenAPI spec (only those with 'input' property)
  const schemas: Record<string, any> = {};
  if (apiSpec.components?.schemas) {
    for (const [name, schema] of Object.entries(apiSpec.components.schemas)) {
      if ((schema as any).properties?.input) {
        schemas[name] = (schema as any).properties.input;
      }
    }
  }

  // Build list of all Pruna models from defaults (exclude trainer models)
  const models: ModelEntry[] = [];
  for (const [modelId, defaultParams] of Object.entries(defaults)) {
    // Include all models except trainers and internal ones
    if (!modelId.includes('-trainer') && !modelId.startsWith('_')) {
      models.push({
        modelId,
        schema: schemas[modelId],
        defaults: defaultParams as Record<string, any>,
      });
    }
  }

  return models;
}

/**
 * Validate that base64 string is a valid image
 * Checks for PNG, JPEG, or WEBP magic bytes
 */
export function isValidPng(base64: string): boolean {
  if (!base64 || typeof base64 !== 'string') return false;

  try {
    // Decode first 12 bytes to check multiple formats
    const bytes = Buffer.from(base64.substring(0, 16), 'base64');

    // PNG magic bytes: \x89PNG\r\n\x1a\n
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

    // JPEG magic bytes: \xFF\xD8\xFF
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    // WEBP magic bytes: RIFF...WEBP
    const isWebp =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

    return isPng || isJpeg || isWebp;
  } catch {
    return false;
  }
}

/**
 * Build valid doGenerate params for a given model
 * Uses model registry to determine what fields to inject (image, LoRA, etc.)
 * Only includes parameters that the specific model actually accepts
 */
export function buildTestParams(modelId: string, defaults: Record<string, any>): Record<string, any> {
  const params: Record<string, any> = {
    prompt: TEST_PROMPT,
    n: 1,
  };

  const config = MODEL_REGISTRY[modelId as keyof typeof MODEL_REGISTRY];
  if (!config) {
    return params; // Fallback for unknown models
  }

  // Determine provider key based on model type
  const isVideo = config.type.includes('video');
  const providerKey = isVideo ? 'pvideo' : 'pimage';

  // For models that require or support images, inject test image URL
  if (config.requiresImage || (config.imageField && (config.type.includes('image') || isVideo))) {
    // Different models expect different field names and types
    if (config.imageField === 'images') {
      // p-image-edit expects 'images' as array
      params.prompt = {
        text: TEST_PROMPT,
        images: [TEST_IMAGE_URL],
      };
    } else if (config.imageField === 'image') {
      // qwen-image-edit-plus, wan-i2v and others expect 'image'
      // The AI SDK's prompt object uses 'images' field which the provider extracts
      params.prompt = {
        text: TEST_PROMPT,
        images: [TEST_IMAGE_URL],
      };
    }
  }

  // For models that support LoRA, inject appropriate LoRA parameter
  // Different models use different parameter names (lora_weights, lora, etc.)
  if (config.supportsLora && config.fields) {
    const providerOpts: Record<string, any> = {};

    // Check which LoRA parameter name this model accepts
    if (config.fields['lora_weights']) {
      // flux-dev-lora, qwen-image use lora_weights
      providerOpts.lora_weights = TEST_LORA_URL;
    } else if (config.fields['lora']) {
      // Some models use just 'lora'
      providerOpts.lora = TEST_LORA_URL;
    } else if (config.fields['lora_weights_transformer']) {
      // Video models have transformer LoRA (wan-i2v, wan-t2v)
      providerOpts.lora_weights_transformer = TEST_LORA_URL;
    } else if (config.fields['lora_scale_transformer']) {
      // Fallback: video models might only have scale without weights
      providerOpts.lora_weights_transformer = TEST_LORA_URL;
    }

    if (Object.keys(providerOpts).length > 0) {
      params.providerOptions = {
        [providerKey]: providerOpts,
      };
    }
  }

  // For models that accept only specific parameters, filter out unsupported ones
  // Use model's field metadata to only include accepted parameters
  if (config.fields) {
    const acceptedFields = Object.keys(config.fields);
    const providerOpts = params.providerOptions?.[providerKey] || {};

    // Add important default fields that might be required or expected
    if (acceptedFields.includes('aspect_ratio') && !providerOpts.aspect_ratio) {
      providerOpts.aspect_ratio = defaults.aspect_ratio || '16:9';
    }

    // For video models, ensure num_frames is set (often required)
    if (acceptedFields.includes('num_frames') && !providerOpts.num_frames) {
      providerOpts.num_frames = defaults.num_frames || 81;
    }

    if (Object.keys(providerOpts).length > 0) {
      params.providerOptions = {
        [providerKey]: providerOpts,
      };
    }
  }

  return params;
}

/**
 * Get byte length of base64 string without decoding the entire buffer
 */
export function base64ByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=/g) || []).length;
  return Math.floor((base64.length * 3) / 4) - padding;
}
