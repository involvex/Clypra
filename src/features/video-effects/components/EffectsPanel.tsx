/**
 * Main Effects Panel Component
 * Video Effects (renderer-based) and Body Effects only
 */

import React, { useState } from "react";
import { EffectPicker } from "./EffectPicker";
import { RendererEffectsBrowser } from "./RendererEffectsBrowser";
import type { EffectPreset } from "../types";
import type { EffectRenderer as EffectRendererType } from "@clypra/engine";
import { useUIStore } from "@/store/uiStore";
import { AlertCircle } from "lucide-react";

type EffectTab = "video" | "body";

export function EffectsPanel() {
  const [activeTab, setActiveTab] = useState<EffectTab>("video");
  const selectedClipIds = useUIStore((state) => state.selectedClipIds);

  const handleEffectSelect = async (effect: EffectPreset) => {
    if (!selectedClipIds || selectedClipIds.length === 0) {
      console.warn("No clip selected");
      return;
    }

    const { applyEffectToClip } = await import("../utils/applyEffect");
    applyEffectToClip(selectedClipIds[0], effect);
  };

  const handleRendererEffectSelect = async (effectId: EffectRendererType) => {
    // This is handled by the RendererEffectsBrowser component itself
    console.log("Renderer effect selected:", effectId);
  };

  const hasClipSelected = selectedClipIds && selectedClipIds.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-surface/5 select-none">
      {/* Top Header Control Navigation Row */}
      <div className="flex items-center gap-2 p-1 border-b border-border/50 shrink-0 bg-surface/10">
        <div className="grow overflow-x-auto flex items-center gap-2 pb-0.5 whitespace-nowrap" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setActiveTab("video")} className={`px-2 py-0.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${activeTab === "video" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary hover:bg-surface-raised/40"}`}>
            Video Effects
          </button>
          <button onClick={() => setActiveTab("body")} className={`px-2 py-0.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${activeTab === "body" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary hover:bg-surface-raised/40"}`}>
            Body Effects
          </button>
        </div>
      </div>

      {/* Selection Hint */}
      {!hasClipSelected && (
        <div className="flex items-start gap-2 p-2.5 bg-yellow-500/10 border-b border-yellow-500/25 text-xs text-yellow-200 leading-normal">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Select a clip on the timeline to apply {activeTab === "video" ? "video effects" : "body effects"}</span>
        </div>
      )}

      {/* Tab Content */}
      <div className="grow overflow-y-auto scrollbar-thin">
        {activeTab === "video" && <RendererEffectsBrowser onEffectSelect={handleRendererEffectSelect} selectedClipId={selectedClipIds?.[0]} showApplyButton={hasClipSelected} />}
        {activeTab === "body" && <EffectPicker onSelect={handleEffectSelect} />}
      </div>
    </div>
  );
}
