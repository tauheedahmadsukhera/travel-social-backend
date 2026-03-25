import { renderHook, waitFor } from '@testing-library/react-native';
import { usePagination, useDebounce } from '../usePerformance';

describe('usePerformance hooks', () => {
  describe('usePagination', () => {
    const mockItems = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Item ${i}` }));

    it('loads initial items', () => {
      const { result } = renderHook(() => usePagination(mockItems, 10));

      expect(result.current.displayedItems).toHaveLength(10);
      expect(result.current.hasMore).toBe(true);
    });

    it('loads more items', async () => {
      const { result } = renderHook(() => usePagination(mockItems, 10));

      // Initial load
      expect(result.current.displayedItems).toHaveLength(10);

      // Load more
      result.current.loadMore();

      // Wait for state update
      await waitFor(() => {
        expect(result.current.displayedItems.length).toBeGreaterThan(10);
      });
    });

    it('detects when no more items', () => {
      const { result } = renderHook(() => usePagination(mockItems, 50));

      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('useDebounce', () => {
    it('debounces value changes', async () => {
      jest.useFakeTimers();

      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      expect(result.current).toBe('initial');

      rerender({ value: 'updated' });
      expect(result.current).toBe('initial');

      jest.advanceTimersByTime(500);

      await waitFor(() => {
        expect(result.current).toBe('updated');
      });

      jest.useRealTimers();
    });
  });
});
