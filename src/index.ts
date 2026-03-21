export { PRUNA_AI_PROVIDER_VERSION } from './version';

export {
  PImageModel,
  createPImage,
  pImage,
} from './p-image-model';

export type {
  PImageModelId,
  PImageProvider,
  PImageProviderSettings,
  PImageModelSettings,
  PImageCallOptions,
} from './p-image-model';

export {
  PVideoModel,
  createPVideo,
  pVideo,
} from './p-video-model';

export type {
  PVideoModelId,
  PVideoProvider,
  PVideoProviderSettings,
  PVideoModelSettings,
  PVideoCallOptions,
} from './p-video-model';

// Model registry types (auto-generated from prunatree)
export type {
  ImageModelId,
  VideoModelId,
  AnyModelId,
  ModelConfig,
} from './generated/model-registry';

export {
  IMAGE_MODEL_CONFIGS,
  VIDEO_MODEL_CONFIGS,
  MODEL_REGISTRY,
} from './generated/model-registry';
