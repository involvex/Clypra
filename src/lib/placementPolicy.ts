import type { ClipFitMode } from "./timelineClip";
import type { Clip, MediaAsset, Track } from "@/types";

export interface PlacementPolicy {
  defaultVisualFitMode: ClipFitMode;
  centerAnchor: boolean;
  autoAdaptSequenceForFirstVisualClip: boolean;
}

/**
 * Centralized NLE placement policy used by all media insertion paths.
 * Keep this as the single source of truth for default placement behavior.
 */
export const DEFAULT_PLACEMENT_POLICY: PlacementPolicy = {
  defaultVisualFitMode: "cover",
  centerAnchor: true,
  autoAdaptSequenceForFirstVisualClip: true,
};

export type PlacementIntent = "timeline_end" | "track_end" | "drop";

export function resolveTargetTrackType(asset: Pick<MediaAsset, "type">): "video" | "audio" {
  return asset.type === "audio" ? "audio" : "video";
}

export function resolvePreferredTrackId(params: { tracks: Track[]; asset: Pick<MediaAsset, "type">; preferTrackId?: string | null }): string | null {
  const { tracks, asset, preferTrackId } = params;
  const targetType = resolveTargetTrackType(asset);

  if (preferTrackId) {
    const preferred = tracks.find((t) => t.id === preferTrackId && !t.locked && t.type === targetType);
    if (preferred) return preferred.id;
  }

  const firstUnlocked = tracks.find((t) => t.type === targetType && !t.locked);
  return firstUnlocked?.id ?? null;
}

export function resolveClipStartTime(params: {
  intent: PlacementIntent;
  timelineEndTime: number;
  trackClips?: Clip[];
  dropTime?: number;
}): number {
  const { intent, timelineEndTime, trackClips = [], dropTime = 0 } = params;

  if (intent === "drop") return Math.max(0, dropTime);
  if (intent === "track_end") {
    if (trackClips.length === 0) return 0;
    return Math.max(...trackClips.map((c) => c.startTime + c.duration), 0);
  }
  return Math.max(0, timelineEndTime);
}
