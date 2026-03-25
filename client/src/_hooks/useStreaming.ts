/**
 * useStreaming Hook
 * Manages streaming state and operations
 */

import { useEffect, useState, useCallback } from 'react';
import { SafeStreamingService, StreamingState } from '../../services/implementations/SafeStreamingService';

interface UseStreamingOptions {
  autoInitialize?: boolean;
}

export const useStreaming = (options: UseStreamingOptions = {}) => {
  const { autoInitialize = true } = options;
  
  const [state, setState] = useState<StreamingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const service = SafeStreamingService.getInstance();

  useEffect(() => {
    if (autoInitialize) {
      setLoading(false);
      setState(service.getState());
    }

    // Set up event listeners
    const handleStateChange = (newState: StreamingState) => {
      setState(newState);
    };

    const handleError = (err: any) => {
      setError(err.message || 'Unknown streaming error');
      console.error('[useStreaming] Error:', err);
    };

    service.on('onStateChanged', handleStateChange);
    service.on('onError', handleError);

    return () => {
      service.off('onStateChanged', handleStateChange);
      service.off('onError', handleError);
    };
  }, []);

  const startBroadcast = useCallback(
    async (hostId: string, hostName: string, hostAvatar?: string) => {
      try {
        setError(null);
        const success = await service.startBroadcast(hostId, hostName, hostAvatar);
        if (!success) {
          setError('Failed to start broadcast');
          return false;
        }
        setState(service.getState());
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to start broadcast';
        setError(errMsg);
        return false;
      }
    },
    [service]
  );

  const stopBroadcast = useCallback(async () => {
    try {
      setError(null);
      const success = await service.stopBroadcast();
      if (success) {
        setState(service.getState());
      }
      return success;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to stop broadcast';
      setError(errMsg);
      return false;
    }
  }, [service]);

  const joinStream = useCallback(
    async (roomId: string, userId: string, userName: string) => {
      try {
        setError(null);
        const success = await service.joinStream(roomId, userId, userName);
        if (!success) {
          setError('Failed to join stream');
          return false;
        }
        setState(service.getState());
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to join stream';
        setError(errMsg);
        return false;
      }
    },
    [service]
  );

  const leaveStream = useCallback(
    async (userId: string) => {
      try {
        setError(null);
        const success = await service.leaveStream(userId);
        if (success) {
          setState(service.getState());
        }
        return success;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to leave stream';
        setError(errMsg);
        return false;
      }
    },
    [service]
  );

  const toggleCamera = useCallback((enabled: boolean) => {
    service.toggleCamera(enabled);
    setState(service.getState());
  }, [service]);

  const toggleMic = useCallback((enabled: boolean) => {
    service.toggleMic(enabled);
    setState(service.getState());
  }, [service]);

  const switchCamera = useCallback(() => {
    service.switchCamera();
    setState(service.getState());
  }, [service]);

  return {
    // State
    state,
    loading,
    error,
    
    // Methods
    startBroadcast,
    stopBroadcast,
    joinStream,
    leaveStream,
    toggleCamera,
    toggleMic,
    switchCamera,
    
    // Getters
    isStreaming: state?.isStreaming ?? false,
    isCameraEnabled: state?.isCameraEnabled ?? true,
    isMicEnabled: state?.isMicEnabled ?? true,
    viewerCount: state?.viewers.length ?? 0,
    hasZegoSupport: state?.hasZegoSupport ?? false,
  };
};

export default useStreaming;
