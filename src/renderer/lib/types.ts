// The renderer's view of the bridge contract, which lives in src/shared/api.ts
// so the preload can be checked against it too. Re-exported from here because
// this is the path the renderer has always imported it from.
export * from "../../shared/api";
import type { ElectronAPI } from "../../shared/api";

// window.api only exists in the renderer, so the global belongs here rather
// than in the shared contract - the website compiles that tree too.
declare global {
  interface Window {
    api: ElectronAPI;
  }
}
