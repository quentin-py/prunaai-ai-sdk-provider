# `@prunaai/ai-sdk-provider`

[Pruna AI](https://pruna.ai) provider for the [Vercel AI SDK](https://sdk.vercel.ai).

Supports **image generation**, **image editing**, and **LoRA variants** through a single unified interface — one import, one provider, all models.

---

## Installation

```bash
npm install @prunaai/ai-sdk-provider
```

---

## Setup

Get your API key from the [Pruna AI dashboard](https://dashboard.pruna.ai) and set it as an environment variable:

```bash
export PRUNA_API_KEY=your_api_key_here
```

---

## Provider instance

```ts
import { pImage } from '@prunaai/ai-sdk-provider';
```

For a customised setup:

```ts
import { createPImage } from '@prunaai/ai-sdk-provider';

const pImage = createPImage({
  apiKey: 'your_api_key',          // defaults to PRUNA_API_KEY env var
  baseURL: 'https://api.pruna.ai', // optional — this is the default
  headers: { 'X-Custom-Header': 'value' }, // optional
  pollIntervalMillis: 1000,        // optional — polling interval (default: 1000ms)
  pollTimeoutMillis: 60000,        // optional — polling timeout (default: 60s)
});
```

---

## Image generation — `p-image`

```ts
import { generateImage } from 'ai';
import { pImage } from '@prunaai/ai-sdk-provider';

const { image } = await generateImage({
  model: pImage('p-image'),
  prompt: 'A serene mountain lake at dawn, photorealistic, 4k',
  size: '1024x1024', // maps to width × height; sets aspect_ratio to 'custom' automatically
  seed: 42,          // optional — for reproducible outputs
});

// image.base64      — base64-encoded image data
// image.uint8Array  — Uint8Array binary data
```

### Generation provider options

```ts
const { image } = await generateImage({
  model: pImage('p-image'),
  prompt: 'A fox in a snowy forest',
  providerOptions: {
    pimage: {
      aspect_ratio: '3:2',       // '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | 'custom'
      prompt_upsampling: true,   // expand the prompt with an LLM before generation
      disable_safety_checker: false,
    },
  },
});
```

---

## Image generation with LoRA — `p-image-lora`

```ts
import { generateImage } from 'ai';
import { pImage } from '@prunaai/ai-sdk-provider';

const { image } = await generateImage({
  model: pImage('p-image-lora'),
  prompt: 'A portrait in the style of my fine-tuned model',
  providerOptions: {
    pimage: {
      lora_weights: 'huggingface.co/your-org/your-lora',
      lora_scale: 0.8,      // −1 to 3, default 1
      hf_api_token: '...',  // only needed for private HF repos
    },
  },
});
```

---

## Image editing — `p-image-edit`

Input images are passed via `prompt.images`. They must be URL strings or raw buffers (`Uint8Array` / `ArrayBuffer`) — the provider automatically uploads raw buffers to Pruna before submitting the request.

> **Note:** The `prompt` parameter normally expects a string, but for edit models you pass an object with `{ text, images }`. This requires a type assertion in strict TypeScript codebases:
> ```ts
> prompt: { text: '...', images: [...] } as any
> ```

```ts
import { generateImage } from 'ai';
import { pImage } from '@prunaai/ai-sdk-provider';
import * as fs from 'node:fs';

const sourceImage = fs.readFileSync('photo.jpg'); // Buffer / Uint8Array

const { image } = await generateImage({
  model: pImage('p-image-edit'),
  prompt: {
    text: 'Transform into a watercolour painting with warm tones',
    images: [sourceImage], // 1–5 images; raw buffers are uploaded automatically
  } as any,
});

fs.writeFileSync('edited.png', image.uint8Array);
```

### Edit provider options

```ts
const { image } = await generateImage({
  model: pImage('p-image-edit'),
  prompt: { text: 'Make the sky dramatic and stormy', images: [sourceImage] },
  providerOptions: {
    pimage: {
      edit_aspect_ratio: 'match_input_image', // default
      // 'match_input_image' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
      turbo: true,                // faster generation; disable for complex tasks
      disable_safety_checker: false,
    },
  },
});
```

---

## Image editing with LoRA — `p-image-edit-lora`

```ts
import { generateImage } from 'ai';
import { pImage } from '@prunaai/ai-sdk-provider';

const { image } = await generateImage({
  model: pImage('p-image-edit-lora'),
  prompt: {
    text: 'Apply my custom style to image 1',
    images: [sourceImage],
  } as any,
  providerOptions: {
    pimage: {
      lora_weights: 'huggingface.co/your-org/your-lora',
      lora_scale: 1.0,     // −1 to 3, default 1
      hf_api_token: '...',
    },
  },
});
```

---

## Supported models

| Model | Type | Description |
|---|---|---|
| `p-image` | Generation | Pruna's flagship text-to-image model with 2-stage refinement |
| `p-image-lora` | Generation | p-image with custom LoRA weights support |
| `p-image-edit` | Editing | Edit and compose 1–5 reference images with text instructions |
| `p-image-edit-lora` | Editing | p-image-edit with custom LoRA weights support |

> **Note:** Pruna AI also offers video generation (`p-video`, `wan-i2v`, `wan-t2v`, `vace`) and model training (`p-image-trainer`, `p-image-edit-trainer`) models. The Vercel AI SDK does not currently provide an interface for video generation or model training — use the [Pruna AI API](https://docs.api.pruna.ai) directly for those.

---

## Full `providerOptions.pimage` reference

| Option | Models | Type | Default | Description |
|---|---|---|---|---|
| `aspect_ratio` | generation | string | `'16:9'` | Output aspect ratio. Auto-set to `'custom'` when `size` or `width`/`height` is used. |
| `width` | generation | number | — | Output width in pixels (256–1440, multiple of 16). Sets `aspect_ratio` to `'custom'`. |
| `height` | generation | number | — | Output height in pixels (256–1440, multiple of 16). Sets `aspect_ratio` to `'custom'`. |
| `prompt_upsampling` | generation | boolean | `false` | Expand the prompt with an LLM before generation. |
| `edit_aspect_ratio` | editing | string | `'match_input_image'` | Output aspect ratio for edit models. |
| `turbo` | editing | boolean | `true` | Faster generation. Disable for complex editing tasks. |
| `lora_weights` | lora | string | — | HuggingFace URL for LoRA weights. Required for lora models. |
| `lora_scale` | lora | number | `1` | LoRA influence scale (−1 to 3). Only sent if explicitly provided. |
| `hf_api_token` | lora | string | — | HuggingFace token for private LoRA repos. |
| `disable_safety_checker` | all | boolean | `false` | Disable the safety filter. |

Top-level `generateImage()` parameters also supported:

| Parameter | Description |
|---|---|
| `size` | `'{width}x{height}'` string — sets `aspect_ratio` to `'custom'` automatically |
| `aspectRatio` | `'{w}:{h}'` string — used when no `providerOptions.pimage.aspect_ratio` is set |
| `seed` | Integer seed for reproducible outputs |
| `n` | Number of images to generate (SDK batches calls automatically) |

---

## API reference

This provider implements the [Pruna AI API v0.3.0](https://docs.api.pruna.ai).

**Supported endpoints:**
- `POST /v1/predictions` — Submit image generation or editing predictions
- `GET /v1/predictions/status/{id}` — Poll async prediction status
- `POST /v1/files` — Upload raw image buffers for editing

For complete API documentation, authentication, rate limits, and advanced features, see:
- [Pruna API Docs](https://docs.api.pruna.ai)
- [Quickstart Guide](https://docs.api.pruna.ai/guides/quickstart)

---

## License

MIT
