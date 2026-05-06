import { useState, useEffect, useRef, useCallback } from 'react';
import { useSharedValue, withTiming, Easing, cancelAnimation, runOnJS } from 'react-native-reanimated';

interface Story {
  id: string;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  imageUrl?: string;
}

export function useStories(stories: Story[], initialIndex: number, onClose: () => void) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState(5000);
  const progressSv = useSharedValue(0);
  
  const currentIndexRef = useRef(initialIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setImageLoading(true);
      setVideoDuration(5000);
      progressSv.value = 0;
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose, progressSv]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setImageLoading(true);
      setVideoDuration(5000);
      progressSv.value = 0;
    }
  }, [currentIndex, progressSv]);

  useEffect(() => {
    if (isPaused || imageLoading) {
      cancelAnimation(progressSv);
      return;
    }

    const duration = stories[currentIndex]?.mediaType === 'video' ? videoDuration : 5000;

    progressSv.value = 0;
    progressSv.value = withTiming(100, {
      duration: Math.max(300, duration),
      easing: Easing.linear
    }, (finished) => {
      if (finished) {
        runOnJS(goToNext)();
      }
    });

    return () => cancelAnimation(progressSv);
  }, [currentIndex, isPaused, imageLoading, videoDuration, stories, goToNext, progressSv]);

  return {
    currentIndex,
    setCurrentIndex,
    isPaused,
    setIsPaused,
    imageLoading,
    setImageLoading,
    videoDuration,
    setVideoDuration,
    progressSv,
    goToNext,
    goToPrevious
  };
}
