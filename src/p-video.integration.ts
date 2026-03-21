import { describe, it } from 'vitest';

/**
 * Video model integration tests are temporarily skipped.
 *
 * The Vercel AI SDK (ai@3.4.33 with @ai-sdk/provider@1.1.3) does not yet export
 * VideoModelV1 interface or experimental_generateVideo function.
 *
 * Video models ARE loaded from prunatree:
 * - p-video (text-to-video)
 * - wan-i2v (image-to-video)
 * - wan-t2v (text-to-video variant)
 * - vace (video processing)
 *
 * Once the Vercel AI SDK adds video model support, these tests will be enabled.
 * The p-video-model.ts implementation is already in place and ready for use.
 *
 * @see https://github.com/vercel/ai/discussions (check for VideoModelV1 support)
 */

describe.skip('Integration Tests — Pruna AI Video API (Experimental)', () => {
  it('placeholder: waiting for ai SDK video support', () => {
    // Placeholder test to prevent empty describe blocks
  });
});
