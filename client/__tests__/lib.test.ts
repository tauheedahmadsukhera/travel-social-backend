/**
 * Unit Tests for Critical Functions
 * Run with: npm test
 */

import { describe, expect, it } from '@jest/globals';
import { formatFileSize } from '../lib/imageCompressor';
import { getOptimizedImageUrl } from '../lib/imageHelpers';
import { clusterMarkers, filterMarkersByRegion, limitMarkers } from '../lib/markerClusterer';

describe('Image Helpers', () => {
  describe('getOptimizedImageUrl', () => {
    const fbUrl = 'https://firebasestorage.googleapis.com/v0/b/test/o/image.jpg?alt=media';
    const nonFbUrl = 'https://example.com/image.jpg';

    it('should return original Firebase Storage URL for feed context', () => {
      const result = getOptimizedImageUrl(fbUrl, 'feed');
      expect(result).toBe(fbUrl);
    });

    it('should return original Firebase Storage URL for map-marker context', () => {
      const result = getOptimizedImageUrl(fbUrl, 'map-marker');
      expect(result).toBe(fbUrl);
    });

    it('should return original Firebase Storage URL for thumbnail context', () => {
      const result = getOptimizedImageUrl(fbUrl, 'thumbnail');
      expect(result).toBe(fbUrl);
    });

    it('should return original URL for detail context', () => {
      const result = getOptimizedImageUrl(fbUrl, 'detail');
      expect(result).toBe(fbUrl);
    });

    it('should return non-Firebase URLs unchanged', () => {
      const result = getOptimizedImageUrl(nonFbUrl, 'feed');
      expect(result).toBe(nonFbUrl);
    });

    it('should return original URL for invalid/empty input', () => {
      expect(getOptimizedImageUrl('', 'feed')).toBe('');
      expect(getOptimizedImageUrl(null as any, 'feed')).toBe(null);
    });
  });
});

describe('Marker Clustering', () => {
  describe('clusterMarkers', () => {
    const markers = [
      { id: '1', latitude: 0, longitude: 0, title: 'A' },
      { id: '2', latitude: 0.001, longitude: 0.001, title: 'B' }, // ~110m away
      { id: '3', latitude: 1, longitude: 1, title: 'C' }, // Far away
    ];

    it('should cluster nearby markers', () => {
      const result = clusterMarkers(markers, 0.5); // 500m radius
      expect(result.length).toBe(2); // 1 cluster + 1 single
    });

    it('should handle single marker', () => {
      const result = clusterMarkers([markers[0]], 0.5);
      expect(result).toHaveLength(1);
      expect(result[0].count).toBeUndefined(); // Single markers have no count
    });

    it('should handle empty array', () => {
      const result = clusterMarkers([], 0.5);
      expect(result).toEqual([]);
    });

    it('should separate far markers', () => {
      const result = clusterMarkers(markers, 0.1); // 100m radius
      expect(result.length).toBe(3); // All separate
    });
  });

  describe('limitMarkers', () => {
    const markers = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      latitude: i,
      longitude: i,
    }));

    it('should limit markers to maxMarkers', () => {
      const result = limitMarkers(markers, 50);
      expect(result).toHaveLength(50);
    });

    it('should return all if under limit', () => {
      const result = limitMarkers(markers, 200);
      expect(result).toHaveLength(100);
    });
  });

  describe('filterMarkersByRegion', () => {
    const markers = [
      { id: '1', latitude: 37.78, longitude: -122.43 },
      { id: '2', latitude: 37.79, longitude: -122.42 },
      { id: '3', latitude: 39, longitude: -120 }, // Far away
    ];

    it('should filter markers outside visible region', () => {
      const region = { latitude: 37.785, longitude: -122.425, latitudeDelta: 0.05, longitudeDelta: 0.05 };
      const result = filterMarkersByRegion(markers, region, 0); // No margin
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should include markers within margin', () => {
      const region = { latitude: 37.785, longitude: -122.425, latitudeDelta: 0.05, longitudeDelta: 0.05 };
      const result = filterMarkersByRegion(markers, region, 20); // 20% margin
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

describe('File Utilities', () => {
  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format KB', () => {
      expect(formatFileSize(1024)).toContain('KB');
    });

    it('should format MB', () => {
      expect(formatFileSize(1024 * 1024)).toContain('MB');
    });

    it('should format GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toContain('GB');
    });
  });
});

describe('Error Handling', () => {
  it('should not crash on invalid image URL', () => {
    expect(() => getOptimizedImageUrl('not-a-url', 'feed')).not.toThrow();
  });

  it('should handle missing firebase URL gracefully', () => {
    const url = 'https://example.com/image.jpg';
    const result = getOptimizedImageUrl(url, 'feed');
    expect(result).toBe(url); // Should return unchanged
  });
});
