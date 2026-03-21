import * as fs from 'node:fs';
import * as path from 'node:path';

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
 * Validate that base64 string is a valid PNG
 * Checks for PNG magic bytes: \x89PNG\r\n\x1a\n
 */
export function isValidPng(base64: string): boolean {
  if (!base64 || typeof base64 !== 'string') return false;

  try {
    // Decode first 8 bytes
    const bytes = Buffer.from(base64.substring(0, 12), 'base64');
    // PNG magic bytes
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  } catch {
    return false;
  }
}

/**
 * Build valid doGenerate params for a given model
 * Injects test image URL for edit models, LoRA URL for LoRA models
 */
export function buildTestParams(modelId: string, defaults: Record<string, any>): Record<string, any> {
  const params: Record<string, any> = {
    prompt: TEST_PROMPT,
    n: 1,
  };

  // For edit models, inject test image
  if (modelId.includes('-edit')) {
    params.prompt = {
      text: TEST_PROMPT,
      images: [TEST_IMAGE_URL],
    };
  }

  // For LoRA models, inject test LoRA URL
  if (modelId.includes('-lora')) {
    params.providerOptions = {
      pimage: {
        lora_weights: TEST_LORA_URL,
      },
    };
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
