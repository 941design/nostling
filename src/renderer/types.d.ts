import { RendererApi, LegacyRendererApi } from '../shared/types';

declare global {
  interface Window {
    api: RendererApi & LegacyRendererApi; // Support both during transition
  }
}
