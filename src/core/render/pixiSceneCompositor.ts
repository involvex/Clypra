import { getSharedPixiRenderer, getOrCreateMediaSprite, applyMediaTransform, releaseMediaSprite, applyBodyEffectMask, createGPUBodyOutlineFilter, createGPUBodyGlowFilter, createGPUBodyParticlesFilter, getActiveMediaSpriteKeys, getMediaSpriteRecord, clearAllMediaSprites, ALL_TRANSITIONS } from "@clypra/engine";
import { renderTextLayerBridged, beginTextFrame, endTextFrame } from "./textBridge.js";
import { renderStickerLayerBridged, beginStickerFrame, endStickerFrame } from "./stickerBridge.js";
import { getResourceCache } from "../resources/ResourceCache.js";
import type { EvaluatedScene, EvaluatedVisualLayer, EvaluatedMediaLayer, EvaluatedTextLayer, EvaluatedTransition } from "../evaluation/types.js";
import { Container, RenderTexture, Sprite, Filter } from "pixi.js";
import { getOrUpdateFilters, releaseFilterCache, clearFilterCache } from "./filterCache.js";

const RENDERER_TO_GPU_TRANSITION: Record<string, { id: string; params?: Record<string, any> }> = {
  fade: { id: "cross-dissolve" },
  dissolve: { id: "cross-dissolve" },
  cut: { id: "strobe-cut" },
  slide_left: { id: "push", params: { direction: "left" } },
  slide_right: { id: "push", params: { direction: "right" } },
  slide_up: { id: "push", params: { direction: "up" } },
  slide_down: { id: "push", params: { direction: "down" } },
  wipe_left: { id: "push", params: { direction: "left" } },
  wipe_right: { id: "push", params: { direction: "right" } },
  wipe_up: { id: "push", params: { direction: "up" } },
  wipe_down: { id: "push", params: { direction: "down" } },
  wipe_clockwise: { id: "iris-reveal" },
  wipe_center: { id: "iris-reveal" },
  zoom_in: { id: "zoom", params: { direction: "in", scale: 1.3 } },
  zoom_out: { id: "zoom", params: { direction: "out", scale: 0.7 } },
  zoom_blur: { id: "zoom", params: { direction: "in", scale: 1.3, blurAmount: 12 } },
  circle_expand: { id: "iris-reveal", params: { type: "circle" } },
  circle_collapse: { id: "iris-reveal", params: { type: "circle", invert: true } },
  diamond_expand: { id: "iris-reveal", params: { type: "diamond" } },
  rectangle_expand: { id: "iris-reveal", params: { type: "rectangle" } },
  blur_fade: { id: "cross-dissolve" },
  directional_blur: { id: "cross-dissolve" },
  glitch: { id: "glitch" },
  rgb_split: { id: "chromatic-push" },
  chromatic: { id: "chromatic-push" },
  film_burn: { id: "film-burn-wipe" },
  light_leak: { id: "light-leak-sweep" },
  whip_pan: { id: "push" },
};

export class PixiSceneCompositor {
  private renderer: any;
  private currentFrameId = 0;
  private transitionRenderTextures = new Map<"from" | "to", RenderTexture>();
  private transitionOffscreenContainers = new Map<"from" | "to", Container>();
  private hadActiveTransition = false;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = getSharedPixiRenderer(canvas, width, height);
  }

  async composeFrame(scene: EvaluatedScene, viewport: { scale: number; offsetX: number; offsetY: number; pixelRatio: number; projectWidth?: number; projectHeight?: number }, videoElements: Map<string, HTMLVideoElement>, resourceHandleMap?: Map<string, any>, bodyMasks: Map<string, any> = new Map()): Promise<void> {
    if (!this.renderer.isReady) {
      return;
    }

    const activeTransition = scene.transitions[0];
    let isTransitionActive = false;
    let transitionLayerIds = new Set<string>();
    let definition: any = null;

    if (activeTransition) {
      definition = ALL_TRANSITIONS.find((t) => t.id === activeTransition.type);
      if (!definition) {
        const mapping = RENDERER_TO_GPU_TRANSITION[activeTransition.type];
        if (mapping) {
          definition = ALL_TRANSITIONS.find((t) => t.id === mapping.id);
        }
      }

      if (definition) {
        isTransitionActive = true;
        transitionLayerIds = new Set([activeTransition.outgoingLayer, activeTransition.incomingLayer]);
      } else {
        console.warn("[Compositor] Unknown transition type, falling back to crossfade:", activeTransition.type);
      }
    }

    // Boundary unmount detection
    if (!isTransitionActive && this.hadActiveTransition) {
      this.renderer.unmountTransition();
      const transitionSprite = this.renderer.getTransitionSprite();
      const app = this.renderer.getApp();
      if (transitionSprite && app) {
        transitionSprite.parent?.removeChild(transitionSprite);
        app.stage.addChildAt(transitionSprite, 2);
      }
    }
    this.hadActiveTransition = isTransitionActive;

    // Auto-resize renderer when project dimensions or scale change
    const projectW = viewport.projectWidth || 1920;
    const projectH = viewport.projectHeight || 1080;
    const backingW = Math.round(projectW * viewport.scale);
    const backingH = Math.round(projectH * viewport.scale);
    const app = this.renderer.getApp();
    if (app && (app.screen.width !== backingW || app.screen.height !== backingH)) {
      this.renderer.resize(backingW, backingH);
    }

    this.currentFrameId++;
    const frameId = this.currentFrameId;

    const baseMediaContainer = this.renderer.getOverlayContainer() || this.renderer.getApp()?.stage;
    if (!baseMediaContainer) return;

    // Scale the container to project viewport scale
    baseMediaContainer.scale.set(viewport.scale);
    baseMediaContainer.position.set(0, 0);
    baseMediaContainer.sortableChildren = true;

    // Hide the legacy video sprite to prevent covering the composited layers
    const videoSprite = this.renderer.getVideoSprite();
    if (videoSprite) {
      videoSprite.visible = false;
    }

    // 1. Prepare frame
    beginTextFrame(baseMediaContainer);
    beginStickerFrame(baseMediaContainer);

    const sortedLayers = [...scene.visualLayers];

    // ─── Canonical Visual Stacking Contract ───────────────────────────────────
    // This defines the SINGLE SOURCE OF TRUTH for layer ordering across all renderers:
    // - Pixi preview (this compositor)
    // - Legacy canvas fallback
    // - Export rendering
    // - Thumbnail generation
    //
    // Contract:
    // 1. Lower trackIndex (top in timeline UI) renders LAST → appears ON TOP
    // 2. Within same track, renderOrder (evaluator array index) determines order
    // 3. z-index formula: (maxTrackIndex - trackIndex) * SPACING + renderOrder
    //
    // This ensures:
    // - Track 0 (timeline top) always occludes all other tracks
    // - Overlapping clips on same track follow evaluator sort order
    // - No z-index collisions even with many tracks or clips
    // ──────────────────────────────────────────────────────────────────────────

    // Compute max trackIndex from active visual media layers for robust z-index mapping
    const visualMediaLayers = sortedLayers.filter((layer) => layer.layerType === "media" && (layer.mediaType === "video" || layer.mediaType === "image")) as EvaluatedMediaLayer[];

    const visualTrackIndices = [...new Set(visualMediaLayers.map((layer) => layer.trackIndex ?? 0))].sort((a, b) => a - b);
    const maxTrackIndex = visualTrackIndices.length > 0 ? visualTrackIndices[visualTrackIndices.length - 1] : 0;

    for (let index = 0; index < sortedLayers.length; index++) {
      const layer = sortedLayers[index];
      const renderOrder = index;

      if (layer.layerType === "media") {
        const mediaLayer = layer as EvaluatedMediaLayer;

        if (isTransitionActive && transitionLayerIds.has(mediaLayer.layerId)) {
          continue;
        }

        if (mediaLayer.clipKind === "sticker") {
          await renderStickerLayerBridged(mediaLayer, frameId, baseMediaContainer, viewport, renderOrder);
        } else {
          let sourceElement: any = null;
          if (mediaLayer.mediaType === "video") {
            const key = `${mediaLayer.clipId}-${mediaLayer.mediaId}`;
            sourceElement = videoElements.get(key);

            if (!sourceElement && import.meta.env.DEV) {
              console.warn(`[Clypra Compositor] Active video clip "${mediaLayer.clipId}" has no backing video element (key: ${key}). It will not be rendered.`);
            }
          } else {
            const resolvedHandle = resourceHandleMap?.get(mediaLayer.layerId) ?? mediaLayer.resourceHandle;
            if (resolvedHandle) {
              const resource = getResourceCache().get(resolvedHandle);
              if (resource && resource.data instanceof ImageBitmap) {
                sourceElement = resource.data;
              }
            }
          }

          if (sourceElement) {
            const record = getOrCreateMediaSprite(mediaLayer.clipId, mediaLayer.mediaType, sourceElement, baseMediaContainer);

            // Skip this layer if sprite creation was deferred (video metadata not ready yet)
            if (!record) {
              continue;
            }

            record.lastSeenFrame = frameId;
            record.sprite.visible = true;

            // Update video texture to upload the latest frame to the GPU (critical for stacked tracks/paused states)
            if (mediaLayer.mediaType === "video" && sourceElement instanceof HTMLVideoElement) {
              if (sourceElement.readyState >= 2) {
                // Force texture update to ensure current video frame is uploaded to GPU
                record.texture.source.update();
              }
            }

            // Capture video source dimensions if not already stored
            if (mediaLayer.mediaType === "video" && sourceElement instanceof HTMLVideoElement) {
              const conform = mediaLayer.conform;
              if (conform && (!conform.sourceWidth || !conform.sourceHeight) && sourceElement.videoWidth && sourceElement.videoHeight) {
                const w = sourceElement.videoWidth;
                const h = sourceElement.videoHeight;
                import("../../store/timelineStore")
                  .then(({ useTimelineStore }) => {
                    const timelineStore = useTimelineStore.getState();
                    const existingClip = timelineStore.clips.find((c) => c.id === mediaLayer.clipId);
                    if (existingClip) {
                      const currentConform = existingClip.conform;
                      if (!currentConform || !currentConform.sourceWidth || !currentConform.sourceHeight) {
                        timelineStore.updateClip(mediaLayer.clipId, {
                          conform: {
                            mode: currentConform?.mode || "fit",
                            sourceWidth: w,
                            sourceHeight: h,
                            userScale: currentConform?.userScale ?? 1,
                            userOffsetX: currentConform?.userOffsetX ?? 0,
                            userOffsetY: currentConform?.userOffsetY ?? 0,
                          },
                        });
                      }
                    }
                  })
                  .catch((err) => {
                    console.error("[PixiSceneCompositor] Failed to update clip conform:", err);
                  });
              }
            }

            applyMediaTransform(record.sprite, mediaLayer, viewport);

            const width = record.sprite.texture.source.width || mediaLayer.width;
            const height = record.sprite.texture.source.height || mediaLayer.height;
            const filters = getOrUpdateFilters(mediaLayer, width, height, bodyMasks);
            record.sprite.filters = filters.length > 0 ? filters : null;

            // CRITICAL: Compute z-index from trackIndex for proper NLE stacking
            // Timeline convention: lower-numbered tracks are visually higher (top in UI)
            // Pixi convention: higher zIndex renders later / on top
            // Therefore: sprite.zIndex = maxTrackIndex - trackIndex
            // Add renderOrder as tiebreaker for clips on same track (multiplied by large spacing to avoid collisions)
            const trackIdx = mediaLayer.trackIndex ?? 0;
            const INTRA_TRACK_SPACING = 1_000_000; // Sufficient spacing for intra-track ordering
            record.sprite.zIndex = (maxTrackIndex - trackIdx) * INTRA_TRACK_SPACING + renderOrder;
          }
        }
      } else if (layer.layerType === "text") {
        const textLayer = layer as EvaluatedTextLayer;
        await renderTextLayerBridged(textLayer, frameId, baseMediaContainer, viewport, renderOrder);
      }
    }

    // Ensure children are sorted by their zIndex before rendering
    if (typeof baseMediaContainer.sortChildren === "function") {
      baseMediaContainer.sortChildren();
    }

    // 2. Reconcile frames
    endTextFrame(frameId, baseMediaContainer);
    endStickerFrame(frameId, baseMediaContainer);

    if (isTransitionActive && activeTransition && definition) {
      const outIdx = sortedLayers.findIndex((l) => l.layerId === activeTransition.outgoingLayer);
      const inIdx = sortedLayers.findIndex((l) => l.layerId === activeTransition.incomingLayer);
      const transitionOrder = Math.max(0, outIdx, inIdx);

      await this.composeActiveTransition(activeTransition, definition, scene, baseMediaContainer, transitionOrder, videoElements, resourceHandleMap);
    }

    const activeMediaKeys = getActiveMediaSpriteKeys();
    for (const clipId of activeMediaKeys) {
      const record = getMediaSpriteRecord(clipId);
      if (record) {
        if (record.lastSeenFrame !== frameId) {
          record.sprite.visible = false;
        }
        if (frameId - record.lastSeenFrame > 180) {
          releaseMediaSprite(clipId, baseMediaContainer);
          releaseFilterCache(clipId);
        }
      }
    }

    // 3. Render stage
    this.renderer.render();
  }

  private async composeActiveTransition(transition: EvaluatedTransition, definition: any, scene: EvaluatedScene, baseMediaContainer: Container, renderOrder: number, videoElements: Map<string, HTMLVideoElement>, resourceHandleMap?: Map<string, any>): Promise<void> {
    const outgoingLayer = scene.visualLayers.find((l) => l.layerId === transition.outgoingLayer) as EvaluatedMediaLayer;
    const incomingLayer = scene.visualLayers.find((l) => l.layerId === transition.incomingLayer) as EvaluatedMediaLayer;
    if (!outgoingLayer || !incomingLayer) return;

    const app = this.renderer.getApp();
    if (!app) return;

    const fromTex = this.renderToOffscreenTexture("from", outgoingLayer, scene, videoElements, resourceHandleMap);
    const toTex = this.renderToOffscreenTexture("to", incomingLayer, scene, videoElements, resourceHandleMap);

    const mapping = RENDERER_TO_GPU_TRANSITION[transition.type];
    const defaultParams = mapping?.params || {};
    const transitionParams = {
      ...defaultParams,
      ...(transition.params || {}),
    };

    const activeId = this.renderer.getActiveTransitionId();
    if (activeId !== definition.id) {
      this.renderer.mountTransition(definition, fromTex, toTex, transitionParams);
    }
    this.renderer.updateTransitionProgress(definition.id, transition.progress, transitionParams);

    baseMediaContainer.visible = true;

    const transitionSprite = this.renderer.getTransitionSprite();
    if (transitionSprite) {
      if (transitionSprite.parent !== baseMediaContainer) {
        transitionSprite.parent?.removeChild(transitionSprite);
        baseMediaContainer.addChild(transitionSprite);
      }
      transitionSprite.visible = true;
      transitionSprite.zIndex = renderOrder;
      transitionSprite.position.set(0, 0);
      transitionSprite.width = scene.metadata.canvasWidth || 1920;
      transitionSprite.height = scene.metadata.canvasHeight || 1080;
    }
  }

  private renderToOffscreenTexture(slot: "from" | "to", layer: EvaluatedMediaLayer, scene: EvaluatedScene, videoElements: Map<string, HTMLVideoElement>, resourceHandleMap?: Map<string, any>): RenderTexture {
    const app = this.renderer.getApp()!;
    const canvasWidth = scene.metadata.canvasWidth || 1920;
    const canvasHeight = scene.metadata.canvasHeight || 1080;

    let texture = this.transitionRenderTextures.get(slot);
    let container = this.transitionOffscreenContainers.get(slot);

    if (!texture || texture.width !== canvasWidth || texture.height !== canvasHeight || !container) {
      if (texture) {
        texture.destroy(true);
      }
      texture = RenderTexture.create({ width: canvasWidth, height: canvasHeight });
      container = new Container();
      this.transitionRenderTextures.set(slot, texture);
      this.transitionOffscreenContainers.set(slot, container);
    }

    let sourceElement: any = null;
    if (layer.mediaType === "video") {
      const key = `${layer.clipId}-${layer.mediaId}`;
      sourceElement = videoElements.get(key);
    } else {
      const resolvedHandle = resourceHandleMap?.get(layer.layerId) ?? layer.resourceHandle;
      if (resolvedHandle) {
        const resource = getResourceCache().get(resolvedHandle);
        if (resource && resource.data instanceof ImageBitmap) {
          sourceElement = resource.data;
        }
      }
    }

    if (sourceElement) {
      const record = getOrCreateMediaSprite(layer.clipId, layer.mediaType, sourceElement, container);
      record.lastSeenFrame = this.currentFrameId;

      // Update video texture to upload the latest frame to the GPU during transitions
      if (layer.mediaType === "video" && sourceElement instanceof HTMLVideoElement) {
        if (sourceElement.readyState >= 2) {
          record.texture.source.update();
        }
      }

      const layersCopy = { ...layer, opacity: 1.0 };
      const internalViewport = {
        scale: 1.0,
        offsetX: 0,
        offsetY: 0,
        pixelRatio: 1.0,
        projectWidth: canvasWidth,
        projectHeight: canvasHeight,
      };

      applyMediaTransform(record.sprite, layersCopy, internalViewport);

      const width = record.sprite.texture.source.width || layer.width;
      const height = record.sprite.texture.source.height || layer.height;
      const filters = getOrUpdateFilters(layersCopy, width, height, new Map());
      record.sprite.filters = filters.length > 0 ? filters : null;
      record.sprite.visible = true;
      record.sprite.zIndex = 0;

      app.renderer.render({ container, target: texture, clear: true });
    }

    return texture;
  }

  destroy(): void {
    clearFilterCache();

    // Clean up offscreen textures
    for (const texture of this.transitionRenderTextures.values()) {
      texture.destroy(true);
    }
    this.transitionRenderTextures.clear();

    for (const container of this.transitionOffscreenContainers.values()) {
      container.destroy({ children: true });
    }
    this.transitionOffscreenContainers.clear();

    if (this.renderer) {
      const baseMediaContainer = this.renderer.getOverlayContainer() || this.renderer.getApp()?.stage;
      if (baseMediaContainer) {
        clearAllMediaSprites(baseMediaContainer);
      }
      this.renderer.destroy();
    }
  }
}
