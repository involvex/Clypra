/**
 * Renderer Effects Browser
 *
 * Browse and apply renderer-based effects from @clypra/engine
 */

import React, { useState, useEffect } from "react";
import { Download, Play, Plus, Info } from "lucide-react";
import { VideoEffectsApi } from "../api/videoEffectsApi";
import { applyRendererEffectToClip } from "../utils/applyRendererEffect";
import { getEffectMetadata, type EffectMetadata } from "@clypra/engine";
import type { EffectRenderer as EffectRendererType } from "@clypra/engine";

interface RendererEffectsBrowserProps {
  onEffectSelect?: (effectId: EffectRendererType) => void;
  selectedClipId?: string;
  showApplyButton?: boolean;
}

export function RendererEffectsBrowser({ onEffectSelect, selectedClipId, showApplyButton = true }: RendererEffectsBrowserProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("light");
  const [effects, setEffects] = useState<EffectMetadata[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; icon: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [downloadingPreviews, setDownloadingPreviews] = useState<Set<string>>(new Set());

  // Load available categories from API
  useEffect(() => {
    loadCategories();
  }, []);

  // Load effects when category changes
  useEffect(() => {
    if (selectedCategory) {
      loadEffects();
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const manifest = await VideoEffectsApi.getVideoEffectsManifest();

      // Map categories from manifest
      const categoryIcons: Record<string, string> = {
        camera: "🎥",
        light: "💡",
        blur: "🌫️",
        style: "🎨",
        distortion: "🌀",
        time: "⏱️",
        body: "🧍",
      };

      const availableCategories = manifest.categories.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        icon: categoryIcons[cat.id] || "✨",
      }));

      setCategories(availableCategories);

      // Set first category as selected if not already set
      if (availableCategories.length > 0 && !selectedCategory) {
        setSelectedCategory(availableCategories[0].id);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
      // Fallback to default light category
      setCategories([{ id: "light", name: "Light", icon: "💡" }]);
      setSelectedCategory("light");
    }
  };

  const loadEffects = async () => {
    setLoading(true);
    try {
      // Load effects from API by category
      const categoryEffects = await VideoEffectsApi.getRendererEffectsByCategory(selectedCategory);

      // Convert API format to EffectMetadata format
      const metadata: EffectMetadata[] = categoryEffects.map((effect: any) => ({
        id: effect.renderer,
        name: effect.name,
        category: effect.category,
        description: effect.description,
        defaultParams: effect.params,
        parameterSchema: effect.parameterSchema,
        tags: effect.tags,
        premium: effect.isPremium,
      }));

      setEffects(metadata);
    } catch (error) {
      console.error("Failed to load effects:", error);
      // Fallback to local registry if API fails
      try {
        const { getEffectsByCategory } = await import("@clypra/engine");
        const categoryEffects = getEffectsByCategory(selectedCategory as any);
        setEffects(categoryEffects);
      } catch (fallbackError) {
        console.error("Failed to load from local registry:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPreview = async (effectId: string) => {
    if (previewUrls[effectId] || downloadingPreviews.has(effectId)) {
      return;
    }

    setDownloadingPreviews((prev) => new Set(prev).add(effectId));

    try {
      const url = await VideoEffectsApi.getEffectPreviewObjectURL(effectId, selectedCategory);
      setPreviewUrls((prev) => ({ ...prev, [effectId]: url }));
    } catch (error) {
      console.error(`Failed to download preview for ${effectId}:`, error);
    } finally {
      setDownloadingPreviews((prev) => {
        const next = new Set(prev);
        next.delete(effectId);
        return next;
      });
    }
  };

  const handleApplyEffect = (effectId: EffectRendererType) => {
    if (selectedClipId) {
      const metadata = getEffectMetadata(effectId as any);
      applyRendererEffectToClip(selectedClipId, effectId, metadata?.defaultParams || {}, 0.8);
    }

    if (onEffectSelect) {
      onEffectSelect(effectId);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-white">Renderer Effects</h2>
        <p className="text-xs text-zinc-400 mt-1">High-performance effects from @clypra/engine</p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 px-4 py-3 border-b border-zinc-800 overflow-x-auto">
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${selectedCategory === cat.id ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            <span className="mr-1">{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Effects Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-zinc-400 py-8">Loading effects...</div>
        ) : effects.length === 0 ? (
          <div className="text-center text-zinc-400 py-8">No effects in this category yet</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {effects.map((effect) => (
              <EffectCard key={effect.id} effect={effect} previewUrl={previewUrls[effect.id]} isDownloading={downloadingPreviews.has(effect.id)} onDownloadPreview={() => handleDownloadPreview(effect.id)} onApply={() => handleApplyEffect(effect.id as EffectRendererType)} showApplyButton={showApplyButton} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface EffectCardProps {
  effect: EffectMetadata;
  previewUrl?: string;
  isDownloading: boolean;
  onDownloadPreview: () => void;
  onApply: () => void;
  showApplyButton: boolean;
}

function EffectCard({ effect, previewUrl, isDownloading, onDownloadPreview, onApply, showApplyButton }: EffectCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-colors">
      {/* Preview */}
      <div className="relative aspect-video bg-zinc-800">
        {previewUrl ? (
          <video src={previewUrl} loop muted playsInline className="w-full h-full object-cover" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600">
            <span className="text-4xl">{getCategoryIcon(effect.category)}</span>
          </div>
        )}

        {/* Overlay Controls */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity bg-black/50">
          {previewUrl ? (
            <button
              onClick={() => {
                const video = document.querySelector(`video[src="${previewUrl}"]`) as HTMLVideoElement;
                if (video) {
                  isPlaying ? video.pause() : video.play();
                }
              }}
              className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
            >
              <Play size={16} className="text-white" />
            </button>
          ) : (
            <button onClick={onDownloadPreview} disabled={isDownloading} className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors disabled:opacity-50">
              {isDownloading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={16} className="text-white" />}
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-white text-sm">{effect.name}</h3>
        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{effect.description}</p>

        {/* Tags */}
        {effect.tags && effect.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {effect.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Apply Button */}
        {showApplyButton && (
          <button onClick={onApply} className="w-full mt-3 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <Plus size={14} />
            Apply Effect
          </button>
        )}
      </div>
    </div>
  );
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    camera: "🎥",
    light: "💡",
    blur: "🌫️",
    style: "🎨",
    distortion: "🌀",
    time: "⏱️",
    body: "🧍",
  };
  return icons[category] || "✨";
}
