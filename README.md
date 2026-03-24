# `@prunaai/ai-sdk-provider`

[Pruna AI](https://pruna.ai) provider for the [Vercel AI SDK](https://sdk.vercel.ai).

Supports **15 image models** (generation, editing, LoRA) and **4 video models** (text-to-video, image-to-video, video processing) through a single unified interface — one import, all models.

- ✅ **19 models** from prunatree
- ✅ **100% automatically generated** from prunatree schemas
- ✅ **Type-safe** with full TypeScript support
- ✅ **Zero configuration** — just import and use

---

## Installation

```bash
npm install @prunaai/ai-sdk-provider
```

---

## Quick Start

### Setup

Get your API key from the [Pruna AI dashboard](https://dashboard.pruna.ai):

```bash
export PRUNA_API_KEY=your_api_key_here
```

### Image Generation

```ts
import { generateImage } from 'ai';
import { pImage } from '@prunaai/ai-sdk-provider';

const { image } = await generateImage({
  model: pImage('p-image'),
  prompt: 'A serene mountain lake at dawn, photorealistic, 4k',
});

console.log(image.base64); // Base64-encoded image
```

### Video Generation

```ts
import { generateVideo } from 'ai/experimental';
import { pVideo } from '@prunaai/ai-sdk-provider';

const { video } = await generateVideo({
  model: pVideo('wan-t2v'),
  prompt: 'A graceful swan swimming through a misty lake',
});

console.log(video); // Base64-encoded video
```

---

## Image Models (15 total)

### Text-to-Image Generation

```ts
const { image } = await generateImage({
  model: pImage('flux-dev'),
  prompt: 'A steampunk airship with copper details',
});
```

**Available models:**
- `flux-dev` — High-quality text-to-image (FLUX.1-dev)
- `flux-dev-lora` — FLUX with custom LoRA weights
- `flux-2-klein-4b` — Lightweight FLUX variant
- `wan-image-small` — Efficient image generation
- `qwen-image` — Alibaba Qwen image model
- `qwen-image-fast` — Fast Qwen variant
- `p-image` — Pruna flagship model
- `p-image-pro` — High-quality Pruna variant
- `z-image-turbo` — Ultra-fast generation
- `z-image-turbo-lora` — Turbo with LoRA support
- `z-image-turbo-small` — Lightweight Turbo

### Image Editing

```ts
import * as fs from 'node:fs';

const sourceImage = fs.readFileSync('photo.jpg'); // Uint8Array or Buffer

const { image } = await generateImage({
  model: pImage('qwen-image-edit-plus'),
  prompt: {
    text: 'Make the sky more dramatic and dramatic',
    images: [sourceImage],
  } as any,
});
```

**Available models:**
- `qwen-image-edit-plus` — Advanced image editing
- `p-image-edit` — Pruna image editor
- `p-image-edit-lora` — Editor with LoRA support

### Custom LoRA Fine-Tuning

```ts
const { image } = await generateImage({
  model: pImage('p-image-lora'),
  prompt: 'A portrait in my custom style',
  providerOptions: {
    pimage: {
      lora_weights: 'https://huggingface.co/your-org/your-lora',
      lora_scale: 0.8, // −1 to 3, default 1
    },
  },
});
```

---

## Video Models (4 total)

### Text-to-Video

```ts
import { generateVideo } from 'ai/experimental';
import { pVideo } from '@prunaai/ai-sdk-provider';

const { video } = await generateVideo({
  model: pVideo('wan-t2v'),
  prompt: 'A person walking through a snowy forest at sunset',
  providerOptions: {
    pvideo: {
      num_frames: 81,
      frames_per_second: 16,
    },
  },
});
```

**Available models:**
- `wan-t2v` — Text-to-video generation
- `p-video` — Pruna video generation

### Image-to-Video

```ts
const sourceImage = fs.readFileSync('photo.jpg');

const { video } = await generateVideo({
  model: pVideo('wan-i2v'),
  prompt: {
    text: 'Smooth camera pan across the landscape',
    images: [sourceImage],
  } as any,
  providerOptions: {
    pvideo: {
      num_frames: 81,
    },
  },
});
```

**Available models:**
- `wan-i2v` — Image-to-video generation with motion control

### Video Processing

```ts
const { video } = await generateVideo({
  model: pVideo('vace'),
  prompt: {
    text: 'Apply cinematic color grading',
    images: [sourceVideo], // Can process video frames
  } as any,
});
```

**Available models:**
- `vace` — Advanced video editing and processing

---

## Provider Configuration

### Image Provider

```ts
import { createPImage } from '@prunaai/ai-sdk-provider';

const pImage = createPImage({
  apiKey: 'your_api_key',                    // defaults to PRUNA_API_KEY
  baseURL: 'https://api.pruna.ai',          // optional
  headers: { 'X-Custom-Header': 'value' }, // optional
});
```

### Video Provider

```ts
import { createPVideo } from '@prunaai/ai-sdk-provider';

const pVideo = createPVideo({
  apiKey: 'your_api_key',
  baseURL: 'https://api.pruna.ai',
  pollIntervalMillis: 1000,        // polling interval (default: 1000ms)
  pollTimeoutMillis: 600000,       // polling timeout (default: 10 minutes)
});
```

---

## Advanced Options

### Image Generation Options

```ts
const { image } = await generateImage({
  model: pImage('flux-dev'),
  prompt: 'A landscape painting',
  providerOptions: {
    pimage: {
      aspect_ratio: '16:9',           // 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, custom
      width: 1024,                    // 256-1440, multiple of 16
      height: 768,                    // 256-1440, multiple of 16
      prompt_upsampling: true,        // enhance with LLM
      seed: 42,                       // reproducible outputs
      disable_safety_checker: false,
    },
  },
});
```

### Video Generation Options

```ts
const { video } = await generateVideo({
  model: pVideo('wan-t2v'),
  prompt: 'A video of...',
  providerOptions: {
    pvideo: {
      num_frames: 81,                    // 1-144, default 81
      frames_per_second: 16,             // default 16
      resolution: '720p',                // 480p, 720p
      aspect_ratio: '16:9',              // 16:9, 9:16, 1:1
      seed: 42,
      disable_safety_checker: false,
      go_fast: true,                     // faster generation
    },
  },
});
```

---

## Complete Model Reference

See [`docs/MODELS.md`](docs/MODELS.md) for a complete table of all 19 models with:
- Model type and description
- Supported parameters per model
- Default values
- Parameter constraints

See [`docs/API.md`](docs/API.md) for detailed parameter documentation for each model.

---

## Automation & Development

This provider is **100% automatically generated from prunatree**. To add a new model or update parameters:

1. Update the prunatree schema:
   - Add model to `P-API.json`
   - Add defaults to `model_param_defaults.json`

2. Generate everything:
   ```bash
   npm run generate-all
   ```

3. Tests and types are automatically updated!

See [`AUTOMATION.md`](AUTOMATION.md) for complete details on the automated generation pipeline.

---

## Error Handling

The provider includes automatic retry logic for transient server errors:

```ts
try {
  const { image } = await generateImage({
    model: pImage('flux-dev'),
    prompt: 'A sunset over mountains',
  });
} catch (error) {
  if (error.message.includes('504')) {
    // Temporary server issue - retries were attempted
    console.error('API server temporarily unavailable');
  }
  // Handle error...
}
```

The provider retries transient 504 Gateway Timeout errors with exponential backoff (3 attempts, 2s/4s/8s delays).

---

## Testing

Run integration tests against live Pruna API:

```bash
export PRUNA_API_KEY=your_api_key
npm run test:integration
```

All 16 models are tested automatically. See test results and model status in the output.

---

## Type Safety

Full TypeScript support with auto-generated types:

```ts
import type { ImageModelId, VideoModelId, AnyModelId } from '@prunaai/ai-sdk-provider';

const modelId: ImageModelId = 'flux-dev';  // ✅ type-checked
const videoId: VideoModelId = 'wan-t2v';   // ✅ type-checked
```

---

## API Reference

This provider implements the [Pruna AI API](https://docs.api.pruna.ai).

**Supported endpoints:**
- `POST /v1/predictions` — Submit generation/editing predictions
- `GET /v1/predictions/status/{id}` — Poll async prediction status
- `POST /v1/files` — Upload image/video buffers

For complete API documentation:
- [Pruna API Docs](https://docs.api.pruna.ai)
- [Model Documentation](https://docs.api.pruna.ai/guides/models)
- [API Reference](https://docs.api.pruna.ai/api-reference)

---

## License

MIT
