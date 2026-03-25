import { useState, useEffect, useCallback } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Hook for lazy loading heavy components
 * Delays rendering until interactions are complete
 */
export function useLazyLoad(delay: number = 0): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        setIsReady(true);
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isReady;
}

/**
 * Hook for pagination
 */
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 20
) {
  const [currentPage, setCurrentPage] = useState(1);
  const [displayedItems, setDisplayedItems] = useState<T[]>([]);

  useEffect(() => {
    const startIndex = 0;
    const endIndex = currentPage * itemsPerPage;
    setDisplayedItems(items.slice(startIndex, endIndex));
  }, [items, currentPage, itemsPerPage]);

  const loadMore = useCallback(() => {
    if (displayedItems.length < items.length) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [displayedItems.length, items.length]);

  const hasMore = displayedItems.length < items.length;

  return {
    displayedItems,
    loadMore,
    hasMore,
    reset: () => setCurrentPage(1),
  };
}

/**
 * Hook for debouncing values
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for measuring component performance
 */
export function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    const startTime = Date.now();
    
    return () => {
      const endTime = Date.now();
      const renderTime = endTime - startTime;
      
      if (renderTime > 1000) {
        console.warn(`[Performance] ${componentName} took ${renderTime}ms to render`);
      }
    };
  }, [componentName]);
}
