import React, { useState, useEffect, useMemo } from "react";
import { Search, Sparkles, AlertCircle } from "lucide-react";
import type { EffectPreset } from "../types";
import { VideoEffectsApi } from "../api/videoEffectsApi";

interface EffectPickerProps {
  onSelect: (effect: EffectPreset) => void;
}

export function EffectPicker({ onSelect }: EffectPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [effects, setEffects] = useState<EffectPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBodyEffects();
  }, []);

  const loadBodyEffects = async () => {
    setLoading(true);
    setError(null);
    try {
      const bodyEffects = await VideoEffectsApi.getBodyEffects();
      setEffects(bodyEffects);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load body effects";
      setError(message);
      console.error("Failed to load body effects:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEffects = useMemo(() => {
    let filtered = effects;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e: EffectPreset) => e.name.toLowerCase().includes(query) || e.category.toLowerCase().includes(query));
    }

    return filtered;
  }, [effects, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 shrink-0 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search body effects..." className="w-full bg-surface-raised border border-border/60 rounded-lg pl-9 pr-4 py-2 text-xs text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all selectable" />
        </div>
      </div>

      {/* Grid Content */}
      <div className="grow overflow-y-auto p-3 scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filteredEffects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-1 text-xs text-text-muted">
            <p>No matching effects found</p>
            <p className="opacity-60">Try another search</p>
          </div>
        )}

        {!loading && !error && filteredEffects.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {filteredEffects.map((effect) => (
              <EffectCard key={effect.id} effect={effect} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EffectCard: React.FC<{ effect: EffectPreset; onSelect: (effect: EffectPreset) => void }> = ({ effect, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="group relative aspect-square bg-surface-raised hover:bg-surface-raised/60 rounded-lg overflow-hidden transition-all border border-border hover:border-accent/30 cursor-pointer" onClick={() => onSelect(effect)} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {effect.isPremium && (
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-linear-to-r from-purple-500 to-pink-500 rounded-full p-1">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {effect.thumbnail ? (
        <img src={effect.thumbnail} alt={effect.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-accent/20 to-accent/5">
          <span className="text-4xl opacity-40">🎬</span>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2 transition-opacity ${isHovered ? "opacity-100" : "opacity-0"}`}>
        <p className="text-xs font-semibold text-white truncate">{effect.name}</p>
      </div>

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
    </div>
  );
};
