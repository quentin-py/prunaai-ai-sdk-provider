# API Reference

Auto-generated from prunatree. Updated: 2026-03-24T13:33:37.950Z

Generated for **19 models** from prunatree.


---

## `flux-dev` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image generation |
| `speed_mode` | string | Juiced 🔥 (default) | Speed optimization level |
| `num_inference_steps` | integer | 28 | Number of inference steps |
| `guidance` | number | 3.5 | Guidance scale |
| `seed` | integer | -1 | Random seed (-1 for random) |
| `aspect_ratio` | string | 1:1 | Aspect ratio of output image |
| `image_size` | integer | 1024 | Base image size (longest side) |
| `output_format` | string | jpg | Output format |
| `output_quality` | integer | 80 | Output quality (for jpg and webp) |

---

## `flux-dev-lora` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image generation |
| `lora` | string | (required) | HuggingFace LoRA URL (e.g., owner/model-name) |
| `lora_scale` | number | 1 | LoRA application strength |
| `extra_lora` | string | (required) | Second HuggingFace LoRA URL |
| `extra_lora_scale` | number | 1 | Second LoRA application strength |
| `image` | string | (required) | Input image for img2img mode |
| `prompt_strength` | number | 0.8 | Prompt strength for img2img |
| `num_outputs` | integer | 1 | Number of outputs to generate |
| `num_inference_steps` | integer | 28 | Number of denoising steps |
| `guidance` | number | 3 | Guidance scale |
| `seed` | integer | (required) | Random seed |
| `aspect_ratio` | string | 1:1 | Aspect ratio of output image |
| `output_format` | string | jpg | Output format |
| `output_quality` | integer | 80 | Output quality (for jpg/webp) |
| `speed_mode` | string | Juiced 🧃 | Speed optimization level |
| `megapixels` | string | 1 | Approximate megapixels for output |

---

## `p-image` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image generation |
| `aspect_ratio` | string | 16:9 | Aspect ratio for the generated image. Use 'custom' to specify width and height manually. |
| `width` | integer | (required) | Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. |
| `height` | integer | (required) | Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. |
| `seed` | integer | (required) | Random seed for reproducible generation |
| `disable_safety_checker` | boolean | false | Disable safety checker for generated images |

---

## `p-image-edit` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image editing |
| `images` | array | (required) | Images to use as reference (1-5 images) |
| `mode` | string | default | Mode to use with P-Edit |
| `aspect_ratio` | string | match_input_image | Aspect ratio for the generated image |
| `seed` | integer | (required) | Random seed for reproducible generation |
| `disable_safety_checker` | boolean | false | Disable safety checker for generated images |
| `turbo` | boolean | true | If turned on, the model will run faster with additional optimizations. For complicated tasks, it is recommended to turn this off. |

---


---


---


---


---

## `qwen-image` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image generation |
| `enhance_prompt` | boolean | false | Enhance the prompt with positive magic |
| `lora_weights` | string | (required) | URL to LoRA weights (.safetensors, .tar, .zip) |
| `lora_scale` | number | 1 | LoRA application strength |
| `image` | string | (required) | Input image for img2img mode |
| `guidance` | number | 4 | Guidance scale |
| `aspect_ratio` | string | 16:9 | Image aspect ratio |
| `output_format` | string | webp | Output format |
| `output_quality` | integer | 80 | Output quality (for jpg/webp) |
| `negative_prompt` | string | (required) | Negative prompt to avoid certain features |
| `num_inference_steps` | integer | 50 | Number of denoising steps |

---

## `qwen-image-edit-plus` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image` | mixed | (required) | Image URL(s) to edit/combine (1-2 images) |
| `prompt` | string | (required) | Text description of the desired edit |
| `aspect_ratio` | string | match_input_image | Output aspect ratio |
| `output_format` | string | webp | Output format |
| `output_quality` | integer | 95 | Output quality (for jpg/webp) |

---


---

## `vace` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt describing the edit |
| `src_video` | string | (required) | Input video to edit (HTTP URL or base64 data URI) |
| `src_mask` | string | (required) | Input mask video or image (HTTP URL or base64 data URI) |
| `src_ref_images` | array | (required) | Array of reference images (HTTP URLs or base64 data URIs) |
| `speed_mode` | string | Lightly Juiced 🍊 (more consistent) | Speed optimization level |
| `frame_num` | integer | 81 | Number of frames to generate |
| `size` | string | 832*480 | Output resolution |
| `seed` | integer | -1 | Random seed (-1 for random) |
| `sample_shift` | integer | 16 | Sample shift parameter |
| `sample_solver` | string | unipc | Sample solver algorithm |
| `sample_steps` | integer | 50 | Number of sampling steps |
| `sample_guide_scale` | number | 5 | Guidance scale for sampling |

---

## `wan-i2v` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for video generation |
| `image` | string | (required) | Input image to generate video from |
| `last_image` | string | (required) | Optional last image to condition the video generation. If provided, creates smoother transitions between frames |
| `num_frames` | integer | 81 | Number of video frames. 81 frames give the best results |
| `resolution` | string | 480p | Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px |
| `frames_per_second` | integer | 16 | Frames per second. Note that the pricing of this model is based on the video duration at 16 fps |
| `go_fast` | boolean | true | Go fast |
| `sample_shift` | number | 12 | Sample shift factor |
| `seed` | integer | (required) | Random seed. Leave blank for random |
| `disable_safety_checker` | boolean | false | Disable safety checker for generated video |
| `lora_weights_transformer` | string | (required) | Load LoRA weights for the HIGH transformer. Supports arbitrary .safetensors URLs from the Internet (e.g., 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_hinoise.safetensors') |
| `lora_scale_transformer` | number | 1 | Determines how strongly the transformer LoRA should be applied |
| `lora_weights_transformer_2` | string | (required) | Load LoRA weights for the LOW transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA (e.g., 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_lownoise.safetensors') |
| `lora_scale_transformer_2` | number | 1 | Determines how strongly the transformer_2 LoRA should be applied |

---

## `wan-image-small` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for image generation |
| `juiced` | boolean | false | Enable faster generation |
| `aspect_ratio` | string | 16:9 | Aspect ratio for the generated image. Use 'custom' to specify width and height manually. |
| `width` | integer | (required) | Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. |
| `height` | integer | (required) | Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. |
| `seed` | integer | (required) | Random seed for reproducible generation |
| `output_format` | string | jpg | Output format |
| `output_quality` | integer | 80 | Output quality (for jpg/webp) |

---

## `wan-t2v` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Text prompt for video generation |
| `optimize_prompt` | boolean | false | Translate prompt to Chinese before generation |
| `num_frames` | integer | 81 | Number of video frames. 81 frames give the best results |
| `aspect_ratio` | string | 16:9 | Aspect ratio of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px |
| `resolution` | string | 480p | Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px |
| `frames_per_second` | integer | 16 | Frames per second. Note that the pricing of this model is based on the video duration at 16 fps |
| `go_fast` | boolean | true | Go fast |
| `sample_shift` | number | 12 | Sample shift factor |
| `seed` | integer | (required) | Random seed. Leave blank for random |
| `disable_safety_checker` | boolean | false | Disable safety checker for generated video |
| `lora_weights_transformer` | string | (required) | Load LoRA weights for transformer. Supports arbitrary .safetensors URLs from the Internet (e.g., 'https://huggingface.co/Viktor1717/scandinavian-interior-style1/resolve/main/my_first_flux_lora_v1.safetensors') |
| `lora_scale_transformer` | number | 1 | Determines how strongly the transformer LoRA should be applied |
| `lora_weights_transformer_2` | string | (required) | Load LoRA weights for transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA |
| `lora_scale_transformer_2` | number | 1 | Determines how strongly the transformer_2 LoRA should be applied |

---


---


---


---

