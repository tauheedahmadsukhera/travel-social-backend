import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@/lib/storage';
import { auth } from '../config/firebase';
import { ZEEGOCLOUD_CONFIG, generateRoomId } from '../config/zeegocloud';
import ZeegocloudStreamingService from '../services/implementations/ZeegocloudStreamingService';
import { endLiveStream, getActiveLiveStreams, startLiveStream, subscribeToLiveViewers } from '../lib/firebaseHelpers/live';
import { logger } from '../utils/logger';
import { DEFAULT_AVATAR_URL } from '../lib/api';

export interface Viewer {
  id: string;
  name: string;
  avatar: string;
  location?: { latitude: number; longitude: number };
}

export function useLiveStream() {
  const zeegocloudServiceRef = useRef<ZeegocloudStreamingService | null>(null);
  const viewersUnsubRef = useRef<null | (() => void)>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [streamDuration, setStreamDuration] = useState(0);

  const isStreamingRef = useRef(isStreaming);
  const isExplicitlyEndingRef = useRef<boolean>(false);
  const backendStreamIdRef = useRef<string | null>(null);
  const streamOwnerIdRef = useRef<string | null>(null);
  const streamStartTimeRef = useRef<number>(0);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

  // Load user data
  useEffect(() => {
    const user = auth?.currentUser;
    if (user) {
      setCurrentUser({
        uid: user.uid,
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL || DEFAULT_AVATAR_URL
      });
    }
  }, []);

  const normalizeStreamId = useCallback((value: any): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      if (typeof (value as any).$oid === 'string') return (value as any).$oid;
      if (typeof (value as any).toHexString === 'function') {
        try { return (value as any).toHexString(); } catch {}
      }
      if (typeof (value as any).toString === 'function') {
        try {
          const s = (value as any).toString();
          if (s && s !== '[object Object]') return s;
        } catch {}
      }
    }
    return null;
  }, []);

  const resolveOwnActiveStreamId = useCallback(async (userId: string): Promise<string | null> => {
    try {
      const streams: any[] = await getActiveLiveStreams();
      if (!Array.isArray(streams) || streams.length === 0) return null;
      const mine = streams.find((s: any) => String(s?.userId || '') === String(userId));
      return normalizeStreamId(mine?.id) || normalizeStreamId(mine?._id);
    } catch {
      return null;
    }
  }, [normalizeStreamId]);

  const endBackendStreamBestEffort = useCallback(async (streamId: string, userId: string | null | undefined) => {
    try {
      if (!streamId || !userId) return;
      const first: any = await endLiveStream(String(streamId), String(userId));
      if (first?.success === true) return;
      const fallbackUserId = auth?.currentUser?.uid;
      if (fallbackUserId && String(fallbackUserId) !== String(userId)) {
        await endLiveStream(String(streamId), String(fallbackUserId));
      }
    } catch (e: any) {
      logger.error('endBackendStreamBestEffort failed:', e);
    }
  }, []);

  const endStreamSilently = useCallback(async () => {
    if (isExplicitlyEndingRef.current || !isStreamingRef.current) return;
    isExplicitlyEndingRef.current = true;
    try {
      if (zeegocloudServiceRef.current) {
        await zeegocloudServiceRef.current.stopBroadcast();
        await zeegocloudServiceRef.current.disconnect();
      }
    } catch (e) { logger.error('Silent stop failed:', e); }

    setIsStreaming(false);
    isStreamingRef.current = false;

    if (viewersUnsubRef.current) {
      viewersUnsubRef.current();
      viewersUnsubRef.current = null;
    }

    try {
      let streamId = backendStreamIdRef.current;
      const userId = streamOwnerIdRef.current || currentUser?.uid;
      if (!streamId && userId) streamId = await resolveOwnActiveStreamId(String(userId));
      if (streamId && userId) await endBackendStreamBestEffort(String(streamId), String(userId));
    } catch (e) { logger.error('Silent backend end failed:', e); }

    backendStreamIdRef.current = null;
    streamOwnerIdRef.current = null;
  }, [currentUser, endBackendStreamBestEffort, resolveOwnActiveStreamId]);

  const startViewersPolling = useCallback((streamId: string) => {
    if (!streamId) return;
    if (viewersUnsubRef.current) {
      viewersUnsubRef.current();
      viewersUnsubRef.current = null;
    }
    const unsub = subscribeToLiveViewers(
      String(streamId),
      (items) => {
        const mapped: Viewer[] = (Array.isArray(items) ? items : []).map((v: any) => ({
          id: String(v?.id || ''),
          name: String(v?.name || 'Viewer'),
          avatar: (typeof v?.avatar === 'string' && v.avatar.trim().length > 0) ? v.avatar : DEFAULT_AVATAR_URL,
        }));
        setViewers(mapped);
      },
      (count) => {
        if (typeof count === 'number') setViewerCount(count);
      }
    );
    viewersUnsubRef.current = unsub;
  }, []);

  const startStream = async (effectiveUserId: string, title: string, location: any) => {
    isExplicitlyEndingRef.current = false;
    backendStreamIdRef.current = null;
    streamOwnerIdRef.current = effectiveUserId;

    try {
      setIsInitializing(true);
      const service = ZeegocloudStreamingService.getInstance();
      const userName = currentUser?.displayName || 'Anonymous';
      const newRoomId = generateRoomId(effectiveUserId);

      await service.initialize(effectiveUserId, newRoomId, userName, true);
      zeegocloudServiceRef.current = service;
      setRoomId(newRoomId);

      await service.startBroadcast();
      setIsStreaming(true);

      const resp: any = await startLiveStream(effectiveUserId, {
        title,
        roomId: newRoomId,
        channelName: newRoomId,
        userName,
        userAvatar: currentUser?.photoURL || DEFAULT_AVATAR_URL,
        location,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });

      const newId = normalizeStreamId(resp?.data?.id) || normalizeStreamId(resp?.data?._id) || normalizeStreamId(resp?.id);
      if (newId) {
        backendStreamIdRef.current = newId;
        startViewersPolling(String(newId));
      }
      return true;
    } catch (error) {
      logger.error('startStream error:', error);
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  const endStream = async () => {
    try {
      isExplicitlyEndingRef.current = true;
      if (zeegocloudServiceRef.current) {
        await zeegocloudServiceRef.current.stopBroadcast();
        await zeegocloudServiceRef.current.disconnect();
      }
      setIsStreaming(false);
      if (viewersUnsubRef.current) {
        viewersUnsubRef.current();
        viewersUnsubRef.current = null;
      }
      let streamId = backendStreamIdRef.current;
      const userId = streamOwnerIdRef.current || currentUser?.uid;
      if (!streamId && userId) streamId = await resolveOwnActiveStreamId(String(userId));
      if (streamId && userId) await endBackendStreamBestEffort(String(streamId), String(userId));
      backendStreamIdRef.current = null;
      streamOwnerIdRef.current = null;
      return true;
    } catch (error) {
      logger.error('endStream error:', error);
      return false;
    }
  };

  // Timer
  useEffect(() => {
    let interval: any;
    if (isStreaming) {
      streamStartTimeRef.current = Date.now();
      interval = setInterval(() => {
        setStreamDuration(Math.floor((Date.now() - streamStartTimeRef.current) / 1000));
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isStreaming]);

  // AppState management
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void endStreamSilently();
      }
    });
    return () => {
      sub.remove();
      void endStreamSilently();
    };
  }, [endStreamSilently]);

  return {
    isStreaming,
    isInitializing,
    roomId,
    streamTitle,
    setStreamTitle,
    currentUser,
    viewerCount,
    viewers,
    streamDuration,
    startStream,
    endStream,
  };
}
