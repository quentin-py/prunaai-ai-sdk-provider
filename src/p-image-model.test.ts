import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PImageModel, createPImage } from './p-image-model';
import type { PImageModelId } from './p-image-model';

describe('PImageModel', () => {
  const mockFetch = vi.fn();
  const baseConfig = {
    apiKey: 'test-key',
    fetch: mockFetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('model types and initialization', () => {
    it('should create all supported model types', () => {
      const provider = createPImage(baseConfig);
      const models = [
        { id: 'p-image' as PImageModelId, name: 'generation' },
        { id: 'p-image-lora' as PImageModelId, name: 'generation with LoRA' },
        { id: 'p-image-edit' as PImageModelId, name: 'editing' },
        { id: 'p-image-edit-lora' as PImageModelId, name: 'editing with LoRA' },
      ];

      models.forEach(({ id }) => {
        const model = provider(id);
        expect(model).toBeDefined();
        expect(model.modelId).toBe(id);
        expect(model.provider).toBe('pimage');
        expect(model.specificationVersion).toBe('v1');
        expect(model.maxImagesPerCall).toBe(1);
      });
    });

    it('should support custom model IDs via string & {} type', () => {
      const provider = createPImage(baseConfig);
      const customModel = provider('custom-future-model' as PImageModelId);
      expect(customModel.modelId).toBe('custom-future-model');
    });

    it('should support .image() method on provider', () => {
      const provider = createPImage(baseConfig);
      const model1 = provider('p-image');
      const model2 = provider.image('p-image');
      expect(model1.modelId).toBe(model2.modelId);
    });
  });

  describe('generation models (p-image, p-image-lora)', () => {
    const generateMockSync = () => ({
      ok: true,
      json: async () => ({
        status: 'succeeded',
        generation_url: 'https://cdn.example.com/image.png',
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Map([['content-type', 'application/json']]),
    } as Response);

    it('should accept width, height, aspect_ratio, and prompt_upsampling', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      const result = await model.doGenerate({
        prompt: 'a cat',
        size: '512x512',
        providerOptions: {
          pimage: {
            aspect_ratio: 'custom',
            prompt_upsampling: true,
          },
        },
      });

      expect(result.images).toHaveLength(1);
      expect(result.response).toBeDefined();
      expect(result.response.timestamp).toBeInstanceOf(Date);
      expect(result.response.modelId).toBe('p-image');

      // Verify request body sent to API
      const calls = mockFetch.mock.calls;
      expect(calls[0][1]?.body).toContain('prompt');
      expect(calls[0][1]?.body).toContain('aspect_ratio');
    });

    it('should set aspect_ratio to custom when width/height provided', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      await model.doGenerate({
        prompt: 'a dog',
        providerOptions: {
          pimage: { width: 768, height: 768 },
        },
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.aspect_ratio).toBe('custom');
      expect(requestBody.input.width).toBe(768);
      expect(requestBody.input.height).toBe(768);
    });

    it('p-image-lora should include LoRA fields', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-lora');

      await model.doGenerate({
        prompt: 'custom style',
        providerOptions: {
          pimage: {
            lora_weights: 'huggingface.co/user/model',
            lora_scale: 0.8,
            hf_api_token: 'hf_token',
          },
        },
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.lora_weights).toBe('huggingface.co/user/model');
      expect(requestBody.input.lora_scale).toBe(0.8);
      expect(requestBody.input.hf_api_token).toBe('hf_token');
    });

    it('should warn when using edit-specific params on generation model', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      const result = await model.doGenerate({
        prompt: 'test',
        providerOptions: {
          pimage: {
            turbo: true,
            edit_aspect_ratio: '16:9' as any,
          },
        },
      });

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0].type).toBe('other');
      expect(result.warnings[0].message).toContain('turbo');
    });

    it('should warn when LoRA model missing lora_weights', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-lora');

      const result = await model.doGenerate({
        prompt: 'test',
        providerOptions: { pimage: {} },
      });

      expect(result.warnings.some(w => w.message.includes('lora_weights'))).toBe(true);
    });
  });

  describe('editing models (p-image-edit, p-image-edit-lora)', () => {
    const generateMockSync = () => ({
      ok: true,
      json: async () => ({
        status: 'succeeded',
        generation_url: 'https://cdn.example.com/edited.png',
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Map([['content-type', 'application/json']]),
    } as Response);

    it('should accept edit_aspect_ratio and turbo params', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      const result = await model.doGenerate({
        prompt: { text: 'make it blue', images: ['https://example.com/img.png'] } as any,
        providerOptions: {
          pimage: {
            edit_aspect_ratio: '16:9',
            turbo: false,
          },
        },
      });

      expect(result.images).toHaveLength(1);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.aspect_ratio).toBe('16:9'); // Uses aspect_ratio in request body
      expect(requestBody.input.turbo).toBe(false);
      expect(requestBody.input.images).toContain('https://example.com/img.png');
    });

    it('should resolve image URLs from strings', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      await model.doGenerate({
        prompt: {
          text: 'edit this',
          images: ['https://cdn.example.com/image1.png', 'https://cdn.example.com/image2.png'],
        } as any,
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.images).toEqual([
        'https://cdn.example.com/image1.png',
        'https://cdn.example.com/image2.png',
      ]);
    });

    it('should upload Uint8Array buffers via POST /v1/files', async () => {
      const fileUploadResponse = {
        ok: true,
        json: async () => ({
          id: 'file-123',
          urls: { get: 'https://cdn.example.com/file-123' },
        }),
        headers: new Map(),
      };

      mockFetch
        .mockResolvedValueOnce(fileUploadResponse) // file upload
        .mockResolvedValueOnce(generateMockSync()) // prediction
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(10),
        }); // image download

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      const imageBuffer = new Uint8Array([137, 80, 78, 71]); // PNG header

      await model.doGenerate({
        prompt: { text: 'edit', images: [imageBuffer] } as any,
      });

      // Verify file upload was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/files'),
        expect.objectContaining({ method: 'POST' })
      );

      // Verify uploaded URL was used in prediction
      const predictionCall = mockFetch.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('/v1/predictions')
      );
      const requestBody = JSON.parse(predictionCall[1]?.body);
      expect(requestBody.input.images).toContain('https://cdn.example.com/file-123');
    });

    it('should handle ArrayBuffer image uploads', async () => {
      const fileUploadResponse = {
        ok: true,
        json: async () => ({
          id: 'file-456',
          urls: { get: 'https://cdn.example.com/file-456' },
        }),
        headers: new Map(),
      };

      mockFetch
        .mockResolvedValueOnce(fileUploadResponse)
        .mockResolvedValueOnce(generateMockSync())
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(10),
        });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      const buffer = new ArrayBuffer(100);

      await model.doGenerate({
        prompt: { text: 'test', images: [buffer] } as any,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/files'),
        expect.any(Object)
      );
    });

    it('should warn when edit model missing images', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      const result = await model.doGenerate({
        prompt: 'edit something' as any,
      });

      expect(result.warnings.some(w => w.message.includes('no input images'))).toBe(true);
    });

    it('should warn when using generation-specific params on edit model', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit');

      const result = await model.doGenerate({
        prompt: { text: 'test', images: ['https://example.com/img.png'] } as any,
        providerOptions: {
          pimage: {
            width: 512,
            height: 512,
            prompt_upsampling: true,
          },
        },
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some(w => w.message.includes('width') || w.message.includes('height'))
      ).toBe(true);
    });

    it('p-image-edit-lora should include LoRA fields', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-edit-lora');

      await model.doGenerate({
        prompt: {
          text: 'apply style',
          images: ['https://example.com/img.png'],
        } as any,
        providerOptions: {
          pimage: {
            lora_weights: 'huggingface.co/user/style',
            lora_scale: 1.2,
          },
        },
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.lora_weights).toBe('huggingface.co/user/style');
      expect(requestBody.input.lora_scale).toBe(1.2);
    });
  });

  describe('async prediction polling', () => {
    it('should poll until succeeded status', async () => {
      const asyncResponse = {
        ok: true,
        json: async () => ({
          id: 'pred-123',
          model: 'p-image',
          input: { prompt: 'test' },
          get_url: 'https://api.example.com/v1/predictions/pred-123',
        }),
        headers: new Map(),
      };

      const pollResponse1 = {
        ok: true,
        json: async () => ({ status: 'starting' }),
        headers: new Map(),
      };

      const pollResponse2 = {
        ok: true,
        json: async () => ({ status: 'processing' }),
        headers: new Map(),
      };

      const pollResponse3 = {
        ok: true,
        json: async () => ({
          status: 'succeeded',
          generation_url: 'https://cdn.example.com/result.png',
        }),
        headers: new Map(),
      };

      mockFetch
        .mockResolvedValueOnce(asyncResponse)
        .mockResolvedValueOnce(pollResponse1)
        .mockResolvedValueOnce(pollResponse2)
        .mockResolvedValueOnce(pollResponse3)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(10),
        });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      const result = await model.doGenerate({
        prompt: 'test image',
      });

      expect(result.images).toHaveLength(1);
      // Verify multiple polling calls
      const statusCalls = mockFetch.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('/v1/predictions/status/')
      );
      expect(statusCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect custom poll interval and timeout', async () => {
      const asyncResponse = {
        ok: true,
        json: async () => ({
          id: 'pred-456',
          model: 'p-image',
          input: { prompt: 'slow' },
          get_url: 'https://api.example.com/v1/predictions/pred-456',
        }),
        headers: new Map(),
      };

      const pollResponse = {
        ok: true,
        json: async () => ({ status: 'processing' }),
        headers: new Map(),
      };

      // First call returns async response, subsequent calls always return processing
      mockFetch.mockResolvedValueOnce(asyncResponse);
      mockFetch.mockResolvedValue(pollResponse);

      const provider = createPImage({
        ...baseConfig,
        pollIntervalMillis: 10,
        pollTimeoutMillis: 50, // 50ms timeout with 10ms interval
      });

      const model = provider('p-image');

      try {
        await model.doGenerate({ prompt: 'will timeout' });
        expect.fail('Should have timed out');
      } catch (error: any) {
        expect(error.message).toContain('timed out');
      }
    });

    it('should throw on failed prediction', async () => {
      const asyncResponse = {
        ok: true,
        json: async () => ({
          id: 'pred-fail',
          model: 'p-image',
          input: { prompt: 'bad' },
          get_url: 'https://api.example.com/v1/predictions/pred-fail',
        }),
        headers: new Map(),
      };

      const failResponse = {
        ok: true,
        json: async () => ({
          status: 'failed',
          error: 'Safety filter blocked the image',
        }),
        headers: new Map(),
      };

      mockFetch.mockResolvedValueOnce(asyncResponse).mockResolvedValueOnce(failResponse);

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      try {
        await model.doGenerate({ prompt: 'test' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('failed');
      }
    });
  });

  describe('response handling', () => {
    it('should include response headers in result', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'succeeded',
            generation_url: 'https://cdn.example.com/img.png',
          }),
          headers: new Map([
            ['x-request-id', 'req-123'],
            ['content-type', 'application/json'],
          ]),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(10),
        });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      const result = await model.doGenerate({ prompt: 'test' });

      expect(result.response.headers).toBeDefined();
      expect(Object.keys(result.response.headers || {})).toContain('x-request-id');
    });

    it('should return base64 encoded images', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'succeeded',
            generation_url: 'https://cdn.example.com/img.png',
          }),
          headers: new Map(),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => {
            // Simple 1x1 PNG
            const data = [137, 80, 78, 71, 13, 10, 26, 10];
            return new Uint8Array(data).buffer;
          },
        });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      const result = await model.doGenerate({ prompt: 'test' });

      expect(result.images).toHaveLength(1);
      expect(typeof result.images[0]).toBe('string');
      expect(result.images[0]).toBeTruthy(); // Should be a valid base64 string
    });
  });

  describe('shared features across all models', () => {
    const generateMockSync = () => ({
      ok: true,
      json: async () => ({
        status: 'succeeded',
        generation_url: 'https://cdn.example.com/img.png',
      }),
      arrayBuffer: async () => new ArrayBuffer(10),
      headers: new Map(),
    } as Response);

    it('should support seed parameter', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      await model.doGenerate({
        prompt: 'consistent results',
        seed: 42,
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.seed).toBe(42);
    });

    it('should support disable_safety_checker option', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      await model.doGenerate({
        prompt: 'test',
        providerOptions: {
          pimage: { disable_safety_checker: true },
        },
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body);
      expect(requestBody.input.disable_safety_checker).toBe(true);
    });

    it('should send Model header with correct model ID', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image-lora');

      await model.doGenerate({ prompt: 'test' });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers.Model).toBe('p-image-lora');
    });

    it('should include Try-Sync header on prediction request', async () => {
      mockFetch.mockResolvedValueOnce(generateMockSync());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage(baseConfig);
      const model = provider('p-image');

      await model.doGenerate({ prompt: 'test' });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers['Try-Sync']).toBe('true');
    });
  });

  describe('provider factory', () => {
    it('should load API key from environment variable', () => {
      process.env.PRUNA_API_KEY = 'env-key';
      const provider = createPImage();
      const model = provider('p-image');

      expect(model).toBeDefined();
      delete process.env.PRUNA_API_KEY;
    });

    it('should use provided API key over environment', async () => {
      process.env.PRUNA_API_KEY = 'env-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'succeeded',
          generation_url: 'https://cdn.example.com/img.png',
        }),
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage({
        apiKey: 'provided-key',
        fetch: mockFetch,
      });

      const model = provider('p-image');
      await model.doGenerate({ prompt: 'test' });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers.apikey).toBe('provided-key');

      delete process.env.PRUNA_API_KEY;
    });

    it('should support custom baseURL', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'succeeded',
          generation_url: 'https://example.com/img.png',
        }),
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      const provider = createPImage({
        apiKey: 'test',
        baseURL: 'https://custom.api.example.com',
        fetch: customFetch,
      });

      const model = provider('p-image');
      await model.doGenerate({ prompt: 'test' });

      expect(customFetch.mock.calls[0][0]).toContain('custom.api.example.com');
    });

    it('should support per-model polling overrides', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'processing' }),
        headers: new Map(),
      });

      const provider = createPImage({
        apiKey: 'test',
        fetch: mockFetch,
        pollIntervalMillis: 100,
        pollTimeoutMillis: 500,
      });

      const model = provider('p-image', {
        pollIntervalMillis: 50,
        pollTimeoutMillis: 200,
      });

      expect(model).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw on API request failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const provider = createPImage({
        apiKey: 'test',
        fetch: mockFetch,
      });

      const model = provider('p-image');

      try {
        await model.doGenerate({ prompt: 'test' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('failed');
      }
    });

    it('should throw on image download failure', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'succeeded',
            generation_url: 'https://cdn.example.com/img.png',
          }),
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const provider = createPImage({
        apiKey: 'test',
        fetch: mockFetch,
      });

      const model = provider('p-image');

      try {
        await model.doGenerate({ prompt: 'test' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to download');
      }
    });
  });
});
