/**
 * Text Templates Feature
 * Public exports for text template functionality
 */

export { useTemplateStore } from "./templateStore";
export { injectText, injectColor, hexToLottieColor } from "./TemplateInjector";
export { renderToFrameSequence, renderFrameSequenceToTauri } from "./FrameRenderer";

export type { TemplateDefinition } from "./types";
