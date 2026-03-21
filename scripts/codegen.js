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
  let requiresImage = false;
  let modelType = 'text-to-image';

  if ('images' in properties && required.includes('images')) {
    imageField = 'images';
    requiresImage = true;
  } else if ('image' in properties && required.includes('image')) {
    imageField = 'image';
    requiresImage = true;
  } else if ('image' in properties && !required.includes('image')) {
    // Optional image (qwen-image in img2img mode)
    imageField = 'image';
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
    videoModels[modelId] = {
      type: modelType,
      requiresImage,
      imageField,
      supportsLora,
    };
  } else {
    // Image model
    if (requiresImage) {
      modelType = 'image-edit';
    } else {
      modelType = 'text-to-image';
    }
    imageModels[modelId] = {
      type: modelType,
      requiresImage,
      imageField,
      supportsLora,
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

const configEntry = (config) =>
  `{ type: '${config.type}', requiresImage: ${config.requiresImage}, imageField: ${config.imageField ? `'${config.imageField}'` : 'null'}, supportsLora: ${config.supportsLora} }`;

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
export interface ModelConfig {
  type:
    | 'text-to-image'
    | 'image-edit'
    | 'text-to-video'
    | 'image-to-video'
    | 'video-processing';
  requiresImage: boolean;
  imageField: 'image' | 'images' | null;
  supportsLora: boolean;
}
`;

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
console.log(`\n✨ Generated: ${OUTPUT_PATH}`);
