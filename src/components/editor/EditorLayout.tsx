import React from "react";
import { TopBar } from "./TopBar";
import { EnhancedMediaPanel } from "./EnhancedMediaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { Timeline } from "./timeline/Timeline";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { createClipFromAsset } from "@/lib/timelineClip";
import { createTextClip, TEXT_PRESETS } from "@/lib/textClip";
import { autoAdaptSequenceForFirstVisualClip } from "@/lib/sequenceAutoAspect";
import { DEFAULT_PLACEMENT_POLICY, resolveClipStartTime, resolvePreferredTrackId, resolveTargetTrackType } from "@/lib/placementPolicy";

export const EditorLayout: React.FC = () => {
  const { tracks, clips, addClip, addTrack, getTimelineEndTime } = useTimelineStore();
  const { mediaAssets, project, updateProject } = useProjectStore();

  const handleAddToTimeline = (item: any, type: string) => {
    // Handle different item types
    if (type === "media") {
      const mediaAsset = mediaAssets.find((asset) => asset.id === item.id);
      if (!mediaAsset) return;

      const targetTrackType = resolveTargetTrackType(mediaAsset);
      let targetTrackId = resolvePreferredTrackId({ tracks, asset: mediaAsset });

      // If no track exists for this type, create one
      if (!targetTrackId) {
        addTrack(targetTrackType);
        targetTrackId = resolvePreferredTrackId({ tracks: useTimelineStore.getState().tracks, asset: mediaAsset });
      }

      if (!targetTrackId) return;

      const startTime = resolveClipStartTime({
        intent: "timeline_end",
        timelineEndTime: getTimelineEndTime(),
      });

      if (DEFAULT_PLACEMENT_POLICY.autoAdaptSequenceForFirstVisualClip) {
        autoAdaptSequenceForFirstVisualClip({
          project,
          existingClips: clips,
          asset: mediaAsset,
          updateProject,
        });
      }

      const nextProject = useProjectStore.getState().project;

      const newClip = createClipFromAsset({
        asset: mediaAsset,
        trackId: targetTrackId,
        startTime,
        width: nextProject?.canvasWidth || project?.canvasWidth || 1920,
        height: nextProject?.canvasHeight || project?.canvasHeight || 1080,
      });

      addClip(newClip);
    } else if (type === "text") {
      // Handle text clips
      const targetTrackType = "text";

      // Find or create text track
      let targetTrack = tracks.find((track) => track.type === targetTrackType && !track.locked);

      if (!targetTrack) {
        addTrack(targetTrackType);
        targetTrack = useTimelineStore.getState().tracks.find((t) => t.type === targetTrackType && !t.locked);
      }

      if (!targetTrack) return;

      // Get the end time of all existing clips
      const endTime = getTimelineEndTime();

      // Determine preset settings
      let presetConfig = {};
      if (item.id && item.id.startsWith("text-")) {
        const presetName = item.name?.toLowerCase().replace(/\s+/g, "") as keyof typeof TEXT_PRESETS;
        if (TEXT_PRESETS[presetName]) {
          presetConfig = TEXT_PRESETS[presetName];
        }
      }

      // Create text clip
      const textClip = createTextClip({
        trackId: targetTrack.id,
        startTime: endTime,
        duration: 5.0,
        text: item.name || "Text",
        canvasWidth: project?.canvasWidth || 1920,
        canvasHeight: project?.canvasHeight || 1080,
        ...presetConfig,
      });

      addClip(textClip);
    } else {
      // Handle other types (audio, stickers, effects, transitions, captions)
      // TODO: Implement handlers for other types
    }
  };

  return (
    <div className="w-full h-full flex flex-col app-shell overflow-hidden p-1 gap-2">
      <TopBar />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden gap-2">
        <div className="flex-1 min-h-0 flex overflow-hidden gap-2">
          <EnhancedMediaPanel onAddToTimeline={handleAddToTimeline} />

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden panel-shell">
            <PreviewPanel />
          </div>

          <PropertiesPanel />
        </div>

        <div className="h-80 panel-shell overflow-hidden">
          <Timeline />
        </div>
      </div>
    </div>
  );
};
