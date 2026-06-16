/**
 * Filters API Client
 * Handles all API calls for color grading filters
 */

import type { FilterAsset, FilterCategory } from "../types";

const API_BASE_URL = import.meta.env.VITE_CLYPRA_API_URL;

export class FiltersApi {
  /**
   * Get all filter categories
   */
  static async getCategories(): Promise<FilterCategory[]> {
    const response = await fetch(`${API_BASE_URL}/filters/categories`);
    if (!response.ok) {
      throw new Error(`Failed to fetch filter categories: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get filters by category
   */
  static async getByCategory(category: string): Promise<FilterAsset[]> {
    const response = await fetch(`${API_BASE_URL}/filters/${category}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch filters for category ${category}: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get a specific filter by category and ID
   */
  static async getById(category: string, id: string): Promise<FilterAsset> {
    const response = await fetch(`${API_BASE_URL}/filters/${category}/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch filter ${id}: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Search filters
   */
  static async search(query: string): Promise<FilterAsset[]> {
    const response = await fetch(`${API_BASE_URL}/filters/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Failed to search filters: ${response.statusText}`);
    }
    return response.json();
  }
}
