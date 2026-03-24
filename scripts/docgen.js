#!/usr/bin/env node
/**
 * Auto-generate documentation from prunatree schemas
 * Reads P-API.json and model_param_defaults.json to create:
 * - Model reference documentation
 * - API documentation
 * - Parameter documentation
 */

const fs = require('fs');
const path = require('path');

const apiSpecPath = path.join(__dirname, '../prunatree/services/papi/app/openapi/schemas/P-API.json');
const defaultsPath = path.join(__dirname, '../prunatree/services/papi/app/domain/model_param_defaults.json');
const modelRegistryPath = path.join(__dirname, '../src/generated/model-registry.ts');

let apiSpec = {};
let defaults = {};
let modelRegistry = {};

// Load sources
try {
  if (fs.existsSync(apiSpecPath)) {
    apiSpec = JSON.parse(fs.readFileSync(apiSpecPath, 'utf-8'));
  }
} catch (err) {
  console.warn(`⚠️  Could not load P-API.json:`, err.message);
}

try {
  if (fs.existsSync(defaultsPath)) {
    defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf-8'));
  }
} catch (err) {
  console.warn(`⚠️  Could not load model_param_defaults.json:`, err.message);
}

// Extract model registry from generated file
try {
  if (fs.existsSync(modelRegistryPath)) {
    const content = fs.readFileSync(modelRegistryPath, 'utf-8');
    // Simple extraction - in a real scenario, would parse TypeScript properly
    if (content.includes('IMAGE_MODEL_CONFIGS') && content.includes('VIDEO_MODEL_CONFIGS')) {
      console.log('✓ Model registry found');
    }
  }
} catch (err) {
  console.warn(`⚠️  Could not load model registry:`, err.message);
}

// Extract schemas from OpenAPI spec
const schemas = {};
if (apiSpec.components?.schemas) {
  for (const [name, schema] of Object.entries(apiSpec.components.schemas)) {
    if (schema.properties?.input) {
      schemas[name] = schema.properties.input;
    }
  }
}

// Generate model reference documentation
function generateModelReference() {
  const models = Object.keys(defaults)
    .filter(m => !m.includes('-trainer') && !m.startsWith('_'))
    .sort();

  let doc = `# Model Reference\n\nAuto-generated from prunatree. Updated: ${new Date().toISOString()}\n\n`;

  // Group by type
  const imageModels = models.filter(m => {
    const schema = schemas[m];
    return !schema || !schema.properties?.src_video; // image models don't have src_video
  });

  const videoModels = models.filter(m => {
    const schema = schemas[m];
    return schema && (schema.properties?.src_video || m.includes('i2v') || m.includes('t2v'));
  });

  // Image models section
  if (imageModels.length > 0) {
    doc += `## Image Models (${imageModels.length})\n\n`;
    doc += `| Model ID | Type | Status |\n`;
    doc += `|----------|------|--------|\n`;

    for (const modelId of imageModels) {
      const schema = schemas[modelId];
      let type = 'Generation';
      if (modelId.includes('-edit')) type = 'Editing';
      if (modelId.includes('-lora')) type = 'LoRA';

      doc += `| \`${modelId}\` | ${type} | ✅ Available |\n`;
    }
  }

  // Video models section
  if (videoModels.length > 0) {
    doc += `\n## Video Models (${videoModels.length})\n\n`;
    doc += `| Model ID | Type | Status |\n`;
    doc += `|----------|------|--------|\n`;

    for (const modelId of videoModels) {
      let type = 'Text-to-Video';
      if (modelId.includes('i2v')) type = 'Image-to-Video';
      if (modelId.includes('video-processing')) type = 'Video Processing';

      doc += `| \`${modelId}\` | ${type} | ✅ Available |\n`;
    }
  }

  return doc;
}

// Generate parameter reference for a model
function generateModelParameters(modelId) {
  const schema = schemas[modelId];
  if (!schema || !schema.properties) {
    return '';
  }

  let doc = `## \`${modelId}\` Parameters\n\n`;

  const props = schema.properties;
  doc += `| Parameter | Type | Default | Description |\n`;
  doc += `|-----------|------|---------|-------------|\n`;

  for (const [key, prop] of Object.entries(props)) {
    const type = prop.type || 'mixed';
    const defaultVal = prop.default ?? '(required)';
    const description = prop.description ?? '-';

    doc += `| \`${key}\` | ${type} | ${defaultVal} | ${description} |\n`;
  }

  return doc;
}

// Generate complete API reference
function generateAPIReference() {
  const models = Object.keys(defaults)
    .filter(m => !m.includes('-trainer') && !m.startsWith('_'))
    .sort();

  let doc = `# API Reference\n\nAuto-generated from prunatree. Updated: ${new Date().toISOString()}\n\n`;
  doc += `Generated for **${models.length} models** from prunatree.\n\n`;

  for (const modelId of models) {
    doc += generateModelParameters(modelId);
    doc += '\n---\n\n';
  }

  return doc;
}

// Write generated documentation
function writeDocumentation() {
  const outputDir = path.join(__dirname, '../docs');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write model reference
  const modelRefPath = path.join(outputDir, 'MODELS.md');
  fs.writeFileSync(modelRefPath, generateModelReference());
  console.log(`✓ Generated: ${modelRefPath}`);

  // Write API reference
  const apiRefPath = path.join(outputDir, 'API.md');
  fs.writeFileSync(apiRefPath, generateAPIReference());
  console.log(`✓ Generated: ${apiRefPath}`);

  console.log(`\n✅ Documentation generated in docs/`);
}

// Main
console.log('📚 Generating documentation from prunatree...\n');
writeDocumentation();
