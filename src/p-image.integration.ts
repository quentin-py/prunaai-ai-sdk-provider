import { describe, it, expect, beforeAll } from 'vitest';
import { createPImage } from './p-image-model';
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  loadPrunaTreeModels,
  isValidPng,
  buildTestParams,
  recordTestResult,
  type ModelEntry,
} from './integration-utils';

// Skip all integration tests if no API key is provided
const RUN_INTEGRATION = !!TEST_API_KEY;

describe.skipIf(!RUN_INTEGRATION)('Integration Tests — Pruna AI API', () => {
  const provider = createPImage({
    apiKey: TEST_API_KEY || '',
    baseURL: TEST_BASE_URL,
  });

  const models = loadPrunaTreeModels();

  beforeAll(() => {
    console.log(`\n📦 Found ${models.length} p-image models in prunatree`);
    console.log(`Models: ${models.map((m) => m.modelId).join(', ')}`);
  });

  models.forEach((model) => {
    describe(`${model.modelId}`, () => {
      it('generates successfully and returns valid image', async () => {
        const startTime = Date.now();
        const testName = `${model.modelId}-generation`;

        try {
          const pImageModel = provider(model.modelId as any);
          const testParams = buildTestParams(model.modelId, model.defaults);

          const result = await pImageModel.doGenerate({
            ...testParams,
          });

          const duration = Date.now() - startTime;

          // Assertions
          expect(result.images).toHaveLength(1);
          expect(typeof result.images[0]).toBe('string');
          expect(result.images[0].length).toBeGreaterThan(0);

          // Validate PNG magic bytes
          const isPng = isValidPng(result.images[0]);
          expect(isPng).toBe(true);

          // Check response metadata
          expect(result.response.timestamp).toBeInstanceOf(Date);
          expect(result.response.modelId).toBe(model.modelId);

          // Record success
          recordTestResult(testName, {
            modelId: model.modelId,
            status: 'passed',
            duration_ms: duration,
            request: testParams,
            response: {
              image_size_bytes: result.images[0].length,
              image_base64_prefix: result.images[0].substring(0, 20),
              is_valid_png: isPng,
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
            request: buildTestParams(model.modelId, model.defaults),
            error: error?.message || String(error),
            prunatree_schema_fields: model.schema ? Object.keys(model.schema.properties || {}) : [],
          });
          throw error;
        }
      });

      it('response has correct model ID', async () => {
        const pImageModel = provider(model.modelId as any);
        const testParams = buildTestParams(model.modelId, model.defaults);

        const result = await pImageModel.doGenerate({
          ...testParams,
        });

        expect(result.response.modelId).toBe(model.modelId);
      });

      // Skip seed test for edit models (they don't support seed parameter)
      if (!model.modelId.includes('-edit')) {
        it.skip('seed parameter produces consistent results', async () => {
          // This test is skipped in automated runs since it requires two sequential API calls
          // Run manually with: npm run test:integration -- --reporter=verbose
          const pImageModel = provider(model.modelId as any);
          const testParams = buildTestParams(model.modelId, model.defaults);

          const result1 = await pImageModel.doGenerate({
            ...testParams,
            seed: 12345,
          });

          const result2 = await pImageModel.doGenerate({
            ...testParams,
            seed: 12345,
          });

          // With same seed, image sizes should be very similar
          const size1 = result1.images[0].length;
          const size2 = result2.images[0].length;
          const sizeDiff = Math.abs(size1 - size2);
          const percentDiff = (sizeDiff / size1) * 100;

          expect(percentDiff).toBeLessThan(5); // Allow 5% variance
        });
      }
    });
  });
});
