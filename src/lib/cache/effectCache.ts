/**
 * Effect Cache Manager
 * Handles downloading and caching effect preset JSON definitions from the API to disk
 */

import { BaseDirectory, exists, mkdir, writeFile, readFile, remove, readDir } from "@tauri-apps/plugin-fs";
import { join, appCacheDir } from "@tauri-apps/api/path";
import type { EffectPreset } from "@/features/video-effects/types";

export interface CachedEffect {
  id: string;
  localPath: string; // Relative path under AppCache (e.g. "effects/fx-blur.json")
  effect: EffectPreset;
  fileName: string;
  size: number;
  downloadedAt: number;
}

export interface EffectDownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

const CACHE_DIR = "effects";
const CACHE_INDEX_FILE = "index.json";

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_. ]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

class EffectCacheManager {
  private cacheIndex: Map<string, CachedEffect> = new Map();
  private cacheDir: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const appCache = await appCacheDir();
      this.cacheDir = await join(appCache, CACHE_DIR);

      const dirExists = await exists(this.cacheDir, { baseDir: BaseDirectory.AppCache });
      if (!dirExists) {
        await mkdir(this.cacheDir, { baseDir: BaseDirectory.AppCache, recursive: true });
      }

      await this.loadIndex();
      this.initialized = true;
    } catch (error) {
      console.error("[EffectCache] Failed to initialize:", error);
      throw new Error("Failed to initialize effect cache");
    }
  }

  private async loadIndex(): Promise<void> {
    if (!this.cacheDir) return;

    try {
      const indexPath = await join(this.cacheDir, CACHE_INDEX_FILE);
      const indexExists = await exists(indexPath, { baseDir: BaseDirectory.AppCache });

      if (indexExists) {
        const indexData = await readFile(indexPath, { baseDir: BaseDirectory.AppCache });
        const indexJson = new TextDecoder().decode(indexData);
        const indexArray: CachedEffect[] = JSON.parse(indexJson);

        this.cacheIndex.clear();
        indexArray.forEach((item) => {
          this.cacheIndex.set(item.id, item);
        });
      }
    } catch (error) {
      console.warn("[EffectCache] Failed to load index, starting fresh:", error);
      this.cacheIndex.clear();
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.cacheDir) return;

    try {
      const indexPath = await join(this.cacheDir, CACHE_INDEX_FILE);
      const indexArray = Array.from(this.cacheIndex.values());
      const indexJson = JSON.stringify(indexArray, null, 2);
      const indexData = new TextEncoder().encode(indexJson);

      await writeFile(indexPath, indexData, { baseDir: BaseDirectory.AppCache });
    } catch (error) {
      console.error("[EffectCache] Failed to save index:", error);
    }
  }

  isCached(effectId: string): boolean {
    return this.cacheIndex.has(effectId);
  }

  getCached(effectId: string): CachedEffect | null {
    return this.cacheIndex.get(effectId) || null;
  }

  getCachedPath(effectId: string): string | null {
    const cached = this.cacheIndex.get(effectId);
    return cached ? cached.localPath : null;
  }

  /**
   * Download and cache an effect JSON definition
   */
  async downloadEffect(effect: EffectPreset, onProgress?: (progress: EffectDownloadProgress) => void): Promise<CachedEffect> {
    await this.initialize();

    if (!this.cacheDir) {
      throw new Error("Cache directory not initialized");
    }

    // Return cached if already downloaded
    if (this.isCached(effect.id)) {
      const cached = this.cacheIndex.get(effect.id)!;
      return cached;
    }

    try {
      const sanitizedName = sanitizeFileName(effect.name);
      const fileName = `${effect.id}_${sanitizedName}.json`;
      const relativePath = `${CACHE_DIR}/${fileName}`;

      // Since effects are just JSON, we save the effect object itself
      const effectJson = JSON.stringify(effect, null, 2);
      const fileData = new TextEncoder().encode(effectJson);

      // Simulate progress for consistency
      if (onProgress) {
        onProgress({
          loaded: fileData.length,
          total: fileData.length,
          percentage: 100,
        });
      }

      await writeFile(relativePath, fileData, { baseDir: BaseDirectory.AppCache });

      const cachedFile: CachedEffect = {
        id: effect.id,
        localPath: relativePath,
        effect,
        fileName,
        size: fileData.length,
        downloadedAt: Date.now(),
      };

      this.cacheIndex.set(effect.id, cachedFile);
      await this.saveIndex();

      return cachedFile;
    } catch (error) {
      console.error("[EffectCache] Download failed:", error);
      throw new Error(`Failed to cache effect: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Ensure an effect is cached (download if not already cached)
   */
  async ensureDownloaded(effect: EffectPreset, onProgress?: (progress: EffectDownloadProgress) => void): Promise<CachedEffect> {
    await this.initialize();

    if (this.isCached(effect.id)) {
      return this.cacheIndex.get(effect.id)!;
    }

    return this.downloadEffect(effect, onProgress);
  }

  /**
   * Load a cached effect from disk
   */
  async loadCachedEffect(effectId: string): Promise<EffectPreset | null> {
    await this.initialize();

    const cached = this.cacheIndex.get(effectId);
    if (!cached) return null;

    try {
      const fileExists = await exists(cached.localPath, { baseDir: BaseDirectory.AppCache });
      if (!fileExists) {
        // File was deleted externally, remove from index
        this.cacheIndex.delete(effectId);
        await this.saveIndex();
        return null;
      }

      const data = await readFile(cached.localPath, { baseDir: BaseDirectory.AppCache });
      const jsonText = new TextDecoder().decode(data);
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("[EffectCache] Failed to load cached effect:", error);
      return null;
    }
  }

  /**
   * Clear cache for a specific effect
   */
  async clearCache(effectId: string): Promise<void> {
    await this.initialize();

    const cached = this.cacheIndex.get(effectId);
    if (!cached) return;

    try {
      const fileExists = await exists(cached.localPath, { baseDir: BaseDirectory.AppCache });
      if (fileExists) {
        await remove(cached.localPath, { baseDir: BaseDirectory.AppCache });
      }

      this.cacheIndex.delete(effectId);
      await this.saveIndex();
    } catch (error) {
      console.error("[EffectCache] Failed to clear cache:", error);
      throw error;
    }
  }

  /**
   * Clear all cached effects
   */
  async clearAllCache(): Promise<void> {
    await this.initialize();

    if (!this.cacheDir) return;

    try {
      const entries = await readDir(this.cacheDir, { baseDir: BaseDirectory.AppCache });

      for (const entry of entries) {
        if (entry.name !== CACHE_INDEX_FILE) {
          const filePath = await join(this.cacheDir, entry.name);
          await remove(filePath, { baseDir: BaseDirectory.AppCache });
        }
      }

      this.cacheIndex.clear();
      await this.saveIndex();
    } catch (error) {
      console.error("[EffectCache] Failed to clear all cache:", error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { count: number; totalSize: number; items: CachedEffect[] } {
    const items = Array.from(this.cacheIndex.values());
    const totalSize = items.reduce((sum, item) => sum + item.size, 0);

    return {
      count: items.length,
      totalSize,
      items,
    };
  }

  /**
   * Get all cached effects
   */
  getAllCached(): CachedEffect[] {
    return Array.from(this.cacheIndex.values());
  }
}

export const effectCacheManager = new EffectCacheManager();
