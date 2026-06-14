import { useTimelineStore } from "@/store/timelineStore";
import type { TransitionPreset } from "../types";
import { generateId } from "@/lib/utils/id";
import type { TransitionTimelineItem } from "@/types";

export function applyTransitionBetweenClips(fromClipId: string, toClipId: string, transition: TransitionPreset): void {
  const timelineStore = useTimelineStore.getState();

  // Validate clips exist
  const fromClip = timelineStore.clips.find((c) => c.id === fromClipId);
  const toClip = timelineStore.clips.find((c) => c.id === toClipId);

  if (!fromClip || !toClip) {
    throw new Error("Clips not found");
  }

  // Check if clips are on the same track
  if (fromClip.trackId !== toClip.trackId) {
    throw new Error("Clips must be on the same track");
  }

  // Check if clips are adjacent
  const fromEnd = fromClip.startTime + fromClip.duration;
  const gap = toClip.startTime - fromEnd;

  if (Math.abs(gap) > 0.1) {
    throw new Error("Clips must be adjacent (no gap)");
  }

  // Determine standard duration & properties
  const duration = transition.duration?.default || 0.5;
  const type = transition.id.includes("dissolve") ? "dissolve" : "fade";

  // Calculate start time centered on the cut
  const cutTime = fromEnd;
  const startTime = cutTime - duration / 2;

  // Create transition object
  const transitionData: TransitionTimelineItem = {
    id: generateId("transition"),
    kind: "transition",
    type,
    fromItemId: fromClipId,
    toItemId: toClipId,
    alignment: "center",
    easing: "easeInOut",
    placement: {
      trackId: fromClip.trackId,
      startTime,
      duration,
      role: "effect",
      zIndex: Number.MAX_SAFE_INTEGER,
    },
    effects: {
      effects: [],
      version: 1,
    },
  };

  // Add to timeline
  timelineStore.addTransition(transitionData);
}
