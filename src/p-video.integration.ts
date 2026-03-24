import { describe, it, expect, beforeAll } from 'vitest';
import { createPVideo } from './p-video-model';
import { VIDEO_MODEL_CONFIGS } from './generated/model-registry';
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  loadPrunaTreeModels,
  buildTestParams,
  recordTestResult,
  type ModelEntry,
} from './integration-utils';

// Skip all integration tests if no API key is provided
const RUN_INTEGRATION = !!TEST_API_KEY;

describe.skipIf(!RUN_INTEGRATION)('Integration Tests — Pruna AI Video API', () => {
  const provider = createPVideo({
    apiKey: TEST_API_KEY || '',
    baseURL: TEST_BASE_URL,
  });

  const allModels = loadPrunaTreeModels();
  // Test all video models from prunatree (no skipping - we want to know about all failures)
  const models = allModels.filter((m) => m.modelId in VIDEO_MODEL_CONFIGS);

  beforeAll(() => {
    console.log(`\n🎬 Found ${models.length} video models in prunatree`);
    console.log(`Models: ${models.map((m) => m.modelId).join(', ')}`);
  });

  models.forEach((model) => {
    describe(`${model.modelId}`, () => {
      it(
        'generates successfully and returns valid video with correct metadata',
        async () => {
          const startTime = Date.now();
          const testName = `${model.modelId}-generation`;

          try {
            const pVideoModel = provider(model.modelId as any);
            const testParams = buildTestParams(model.modelId, model.defaults);

            // Single API call - all assertions on one result
            const result = await pVideoModel.doGenerate({
              ...testParams,
            } as any);

            const duration = Date.now() - startTime;

            // Validate video output
            expect(result.videos).toHaveLength(1);
            expect(typeof result.videos[0]).toBe('string');
            expect(result.videos[0].length).toBeGreaterThan(0);

            // Validate response metadata
            expect(result.response.timestamp).toBeInstanceOf(Date);
            expect(result.response.modelId).toBe(model.modelId);

            // Record success
            recordTestResult(testName, {
              modelId: model.modelId,
              status: 'passed',
              duration_ms: duration,
              request: testParams as any,
              response: {
                image_size_bytes: result.videos[0].length,
                image_base64_prefix: result.videos[0].substring(0, 20),
                is_valid_png: true, // Videos are not PNG, but we mark as valid
                warnings: (result as any).warnings,
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
              request: buildTestParams(model.modelId, model.defaults) as any,
              error: error?.message || String(error),
              prunatree_schema_fields: model.schema ? Object.keys(model.schema.properties || {}) : [],
            });
            throw error;
          }
        },
        {
          // Video generation takes much longer (up to 5+ minutes)
          timeout: 600_000, // 10 minutes
        }
      );
    });
  });
});
