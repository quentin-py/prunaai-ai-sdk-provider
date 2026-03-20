import { describe, it, expect, beforeAll } from 'vitest';
import { experimental_generateVideo } from 'ai';
import { createPVideo } from './p-video-model';
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  loadPrunaTreeModels,
  recordTestResult,
  type ModelEntry,
} from './integration-utils';

// Skip all integration tests if no API key is provided
const RUN_INTEGRATION = !!TEST_API_KEY;

describe.skipIf(!RUN_INTEGRATION)('Integration Tests — Pruna AI Video API (Experimental)', () => {
  const provider = createPVideo({
    apiKey: TEST_API_KEY || '',
    baseURL: TEST_BASE_URL,
  });

  const allModels = loadPrunaTreeModels();
  const videoModels = allModels.filter(
    (m) =>
      m.modelId === 'p-video' ||
      m.modelId === 'wan-i2v' ||
      m.modelId === 'wan-t2v' ||
      m.modelId === 'vace',
  );

  beforeAll(() => {
    console.log(`\n🎬 Found ${videoModels.length} video models in prunatree`);
    console.log(`Models: ${videoModels.map((m) => m.modelId).join(', ')}`);
  });

  videoModels.forEach((model) => {
    describe(`${model.modelId}`, () => {
      it('generates successfully and returns valid video', async () => {
        const startTime = Date.now();
        const testName = `${model.modelId}-video-generation`;

        try {
          const pVideoModel = provider(model.modelId as any);

          // Build prompt based on model type
          let prompt: any = 'A serene landscape with mountains and water, cinematic quality';
          if (model.modelId === 'wan-i2v') {
            // Image-to-video needs an image URL
            prompt = {
              image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
              text: 'The scene transitions slowly with gentle movement',
            };
          }

          const result = await experimental_generateVideo({
            model: pVideoModel,
            prompt,
          });

          const duration = Date.now() - startTime;

          // Assertions
          expect(result.videos).toHaveLength(1);
          expect(typeof result.videos[0]).toBe('string');
          expect(result.videos[0].length).toBeGreaterThan(0);

          // Check response metadata
          expect(result.response.timestamp).toBeInstanceOf(Date);
          expect(result.response.modelId).toBe(model.modelId);

          // Record success
          recordTestResult(testName, {
            modelId: model.modelId,
            status: 'passed',
            duration_ms: duration,
            request: typeof prompt === 'string' ? { prompt } : prompt,
            response: {
              image_size_bytes: result.videos[0].length,
              image_base64_prefix: result.videos[0].substring(0, 20),
              is_valid_png: false, // Videos aren't PNG, just check they have content
              warnings: result.warnings,
            },
            error: null,
            prunatree_schema_fields: model.schema ? Object.keys(model.schema.properties || {}) : [],
          });
        } catch (error: any) {
          const duration = Date.now() - startTime;
          recordTestResult(testName, {
            modelId: model.modelId,
            status: 'failed',
            duration_ms: duration,
            request: {
              prompt: 'A serene landscape with mountains and water, cinematic quality',
            },
            error: error?.message || String(error),
            prunatree_schema_fields: model.schema ? Object.keys(model.schema.properties || {}) : [],
          });
          throw error;
        }
      });

      it('response has correct model ID', async () => {
        const pVideoModel = provider(model.modelId as any);
        const prompt = model.modelId === 'wan-i2v'
          ? {
              image:
                'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
              text: 'Gentle movement',
            }
          : 'A simple scene';

        const result = await experimental_generateVideo({
          model: pVideoModel,
          prompt,
        });

        expect(result.response.modelId).toBe(model.modelId);
      });
    });
  });
});
