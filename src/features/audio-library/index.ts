/**
 * Audio Library Feature
 * Public exports for audio library functionality
 */

export { AudioLibraryApi, AUDIO_LIBRARY_CATEGORIES } from "./api/audioLibraryApi";
export type { AudioLibraryItem, AudioLibraryCategory } from "./api/audioLibraryApi";

export { audioCacheManager } from "./cache/audioCache";
export type { CachedAudioFile, DownloadProgress } from "./cache/audioCache";

export { useAudioLibraryStore } from "./store/audioLibraryStore";
