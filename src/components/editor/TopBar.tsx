import React, { useState, lazy, Suspense } from "react";
import { Film, Upload, Home, Settings, Camera, Save, Check } from "lucide-react";
import { Button } from "../ui/Button";
import { usePlayback } from "../../hooks/usePlayback";
import { useProjectStore } from "../../store/projectStore";
import { useUIStore } from "../../store/uiStore";
import { useTimelineStore } from "../../store/timelineStore";
import { useHistoryStore } from "../../store/historyStore";
import { exportFrameAndDownload } from "../../lib/exportFrame";

// Lazy load ExportDialog (code splitting)
const ExportDialog = lazy(() => import("../ui/ExportDialog").then((m) => ({ default: m.ExportDialog })));

export const TopBar: React.FC = () => {
  const { currentTime, duration, formatTime } = usePlayback();
  const { project, closeProject, mediaAssets, scheduleAutoSave } = useProjectStore();
  const { toggleSettingsModal } = useUIStore();
  const { clips, tracks, epoch } = useTimelineStore();
  const { state: historyState } = useHistoryStore();
  const [isExportingFrame, setIsExportingFrame] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleExportFrame = async () => {
    if (!project) return;

    setIsExportingFrame(true);
    try {
      await exportFrameAndDownload({
        time: currentTime,
        clips,
        tracks,
        assets: mediaAssets,
        project,
        epoch,
        format: "png",
      });
    } catch (error) {
      console.error("Failed to export frame:", error);
      alert("Failed to export frame. Check console for details.");
    } finally {
      setIsExportingFrame(false);
    }
  };

  const handleManualSave = () => {
    scheduleAutoSave();
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  return (
    <div className="h-12 panel-shell panel-head flex items-center justify-between px-3 md:px-4 gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={closeProject} title="Back to Home">
          <Home className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border" />
        <Film className="w-5 h-5 text-accent-soft" />
        <span className="text-sm font-semibold text-text-primary">{project?.name}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-text-primary bg-surface-raised border border-border px-3 py-1 rounded-md">
        <span>{formatTime(currentTime)}</span>
        <span className="text-text-muted">/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Undo/Redo indicator */}
        {(historyState.canUndo || historyState.canRedo) && (
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <span title={`${historyState.position + 1} undo actions available`}>{historyState.position + 1} undo</span>
            {historyState.canRedo && (
              <>
                <span>•</span>
                <span title={`${historyState.size - historyState.position - 1} redo actions available`}>{historyState.size - historyState.position - 1} redo</span>
              </>
            )}
          </div>
        )}

        {/* Save button */}
        <Button variant="ghost" size="icon-sm" onClick={handleManualSave} title="Save Project (Cmd+S)" className={showSaved ? "text-green-500" : ""}>
          {showSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        </Button>

        <div className="w-px h-6 bg-border" />

        <Button variant="ghost" size="icon-sm" onClick={handleExportFrame} disabled={isExportingFrame} title="Export Current Frame (PNG)">
          <Camera className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={toggleSettingsModal} title="Settings">
          <Settings className="w-4 h-4" />
        </Button>
        <Button variant="default" size="sm" onClick={() => setShowExportDialog(true)}>
          <Upload className="w-4 h-4" />
          Export Video
        </Button>
      </div>

      {/* Export Dialog */}
      {showExportDialog && (
        <Suspense fallback={null}>
          <ExportDialog isOpen={showExportDialog} onClose={() => setShowExportDialog(false)} />
        </Suspense>
      )}
    </div>
  );
};
