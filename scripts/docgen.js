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

// Model descriptions for ai-sdk.dev
const MODEL_DESCRIPTIONS = {
  // Text-to-Image
  'flux-dev': 'High-quality text-to-image (FLUX.1-dev)',
  'flux-dev-lora': 'FLUX with custom LoRA weights',
  'flux-2-klein-4b': 'Lightweight FLUX variant',
  'wan-image-small': 'Efficient image generation',
  'qwen-image': 'Alibaba Qwen image model',
  'qwen-image-fast': 'Fast Qwen variant',
  'p-image': 'Pruna flagship model with 2-stage refinement',
  'p-image-pro': 'High-quality Pruna variant',
  'p-image-lora': 'p-image with custom LoRA weights',
  'z-image-turbo': 'Ultra-fast generation',
  'z-image-turbo-lora': 'Turbo with LoRA support',
  'z-image-turbo-small': 'Lightweight Turbo',
  // Image Editing
  'qwen-image-edit-plus': 'Advanced image editing',
  'p-image-edit': 'Pruna image editor',
  'p-image-edit-lora': 'Editor with LoRA support',
  // Video
  'p-video': 'Text-to-video with audio synthesis',
  'wan-t2v': 'High-quality text-to-video generation',
  'wan-i2v': 'Image-to-video with motion control',
  'vace': 'Advanced video editing and effects',
};

// Generate provider.mdx for ai-sdk.dev
function generateProviderMdx() {
  const allModels = Object.keys(defaults)
    .filter(m => !m.includes('-trainer') && !m.startsWith('_'))
    .sort();

  // Separate image and video models
  const imageModels = allModels.filter(m => {
    const isVideoModel = m.includes('i2v') || m.includes('t2v') || m === 'vace' || m === 'p-video';
    return !isVideoModel;
  });

  const videoModels = allModels.filter(m => {
    return m.includes('i2v') || m.includes('t2v') || m === 'vace' || m === 'p-video';
  });

  // Categorize image models
  const textToImage = imageModels.filter(m => !m.includes('-edit'));
  const imageEditing = imageModels.filter(m => m.includes('-edit'));

  // Categorize video models
  const textToVideo = videoModels.filter(m => !m.includes('i2v') && m !== 'vace');
  const imageToVideo = videoModels.filter(m => m.includes('i2v'));
  const videoProcessing = videoModels.filter(m => m === 'vace');

  let mdx = `---
title: Pruna AI
description: Learn how to use Pruna AI image and video models with the Vercel AI SDK.
---

# Pruna AI Provider

[Pruna AI](https://pruna.ai) offers fast, efficient image and video generation models optimized for speed and quality. The Pruna AI provider for the Vercel AI SDK supports image generation, image editing, and video generation through a unified interface.

## Setup

The Pruna AI provider is available via the \`@prunaai/ai-sdk-provider\` module. You can install it with:

\`\`\`bash
npm install @prunaai/ai-sdk-provider
\`\`\`

Get your API key from the [Pruna AI dashboard](https://dashboard.pruna.ai) and set it as an environment variable:

\`\`\`bash
export PRUNA_API_KEY=your_api_key_here
\`\`\`

## Provider Instance

You can import the default provider instances from \`@prunaai/ai-sdk-provider\`:

\`\`\`ts
import { pImage, pVideo } from '@prunaai/ai-sdk-provider';
\`\`\`

For customized setup:

\`\`\`ts
import { createPImage, createPVideo } from '@prunaai/ai-sdk-provider';

const pImage = createPImage({
  apiKey: 'your_api_key', // defaults to PRUNA_API_KEY env var
  baseURL: 'https://api.pruna.ai', // optional
});

const pVideo = createPVideo({
  apiKey: 'your_api_key',
  baseURL: 'https://api.pruna.ai',
  pollTimeoutMillis: 600000, // 10 minutes for video generation
});
\`\`\`

## Image Models

### Supported Image Models

**Text-to-Image Generation (${textToImage.length} models):**

| Model | Description |
|---|---|`;

  for (const model of textToImage) {
    const desc = MODEL_DESCRIPTIONS[model] || 'Text-to-image generation';
    mdx += `\n| \`${model}\` | ${desc} |`;
  }

  mdx += `\n\n**Image Editing (${imageEditing.length} models):**\n\n| Model | Description |\n|---|---|`;

  for (const model of imageEditing) {
    const desc = MODEL_DESCRIPTIONS[model] || 'Image editing and composition';
    mdx += `\n| \`${model}\` | ${desc} |`;
  }

  mdx += `\n\nFor complete usage examples and options, see the [Pruna AI documentation](https://docs.api.pruna.ai) or the [README](../README.md).

## Video Models

### Supported Video Models

**Text-to-Video (${textToVideo.length} models):**

| Model | Description |
|---|---|`;

  for (const model of textToVideo) {
    const desc = MODEL_DESCRIPTIONS[model] || 'Text-to-video generation';
    mdx += `\n| \`${model}\` | ${desc} |`;
  }

  if (imageToVideo.length > 0) {
    mdx += `\n\n**Image-to-Video (${imageToVideo.length} models):**\n\n| Model | Description |\n|---|---|`;
    for (const model of imageToVideo) {
      const desc = MODEL_DESCRIPTIONS[model] || 'Image-to-video generation';
      mdx += `\n| \`${model}\` | ${desc} |`;
    }
  }

  if (videoProcessing.length > 0) {
    mdx += `\n\n**Video Processing (${videoProcessing.length} models):**\n\n| Model | Description |\n|---|---|`;
    for (const model of videoProcessing) {
      const desc = MODEL_DESCRIPTIONS[model] || 'Video processing and effects';
      mdx += `\n| \`${model}\` | ${desc} |`;
    }
  }

  mdx += `\n\n<Note>
  Video generation via \`experimental_generateVideo\` is currently experimental
  and may change in future versions. For complete API documentation and examples,
  see the [Pruna AI API documentation](https://docs.api.pruna.ai).
</Note>

## API Reference

This provider implements the [Pruna AI API](https://docs.api.pruna.ai).

**Supported endpoints:**

- \`POST /v1/predictions\` — Submit generation or editing predictions
- \`GET /v1/predictions/status/{id}\` — Poll async prediction status
- \`POST /v1/files\` — Upload raw image/video buffers

For complete API documentation, authentication, rate limits, and advanced features, see:

- [Pruna API Docs](https://docs.api.pruna.ai)
- [Quickstart Guide](https://docs.api.pruna.ai/guides/quickstart)
`;

  return mdx;
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

  // Write provider MDX for ai-sdk.dev
  const providerMdxPath = path.join(outputDir, 'provider.mdx');
  fs.writeFileSync(providerMdxPath, generateProviderMdx());
  console.log(`✓ Generated: ${providerMdxPath}`);

  console.log(`\n✅ Documentation generated in docs/`);
}

// Main
console.log('📚 Generating documentation from prunatree...\n');
writeDocumentation();
