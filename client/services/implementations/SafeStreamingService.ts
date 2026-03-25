/**
 * Safe Streaming Service with Fallback
 * Handles ZegoCloud initialization with graceful fallback
 */

import { ZEEGOCLOUD_CONFIG, generateRoomId, validateZegoConfig } from '../../config/zeegocloud-safe';

export interface StreamingUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface StreamingState {
  isStreaming: boolean;
  roomId: string;
  host: StreamingUser | null;
  viewers: StreamingUser[];
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isFrontCamera: boolean;
  hasZegoSupport: boolean;
}

export class SafeStreamingService {
  private static instance: SafeStreamingService;
  private state: StreamingState = {
    isStreaming: false,
    roomId: '',
    host: null,
    viewers: [],
    isCameraEnabled: true,
    isMicEnabled: true,
    isFrontCamera: true,
    hasZegoSupport: false,
  };
  private eventHandlers: Map<string, Function[]> = new Map();
  private zegoUIKit: any = null;

  private constructor() {
    this.initializeEventHandlers();
    this.detectZegoSupport();
  }

  public static getInstance(): SafeStreamingService {
    if (!SafeStreamingService.instance) {
      SafeStreamingService.instance = new SafeStreamingService();
    }
    return SafeStreamingService.instance;
  }

  private initializeEventHandlers() {
    const events = [
      'onStreamStarted',
      'onStreamEnded',
      'onUserJoined',
      'onUserLeft',
      'onCameraToggled',
      'onMicToggled',
      'onError',
      'onStateChanged',
    ];
    events.forEach(event => this.eventHandlers.set(event, []));
  }

  private async detectZegoSupport() {
    try {
      const config = validateZegoConfig();
      if (!config) {
        console.warn('[SafeStreaming] ZegoCloud config validation failed');
        this.state.hasZegoSupport = false;
        return;
      }

      // Try to load ZegoCloud
      try {
        const zegoModule = await import('@zegocloud/zego-uikit-prebuilt-live-streaming-rn');
        if (zegoModule && zegoModule.default) {
          this.zegoUIKit = zegoModule.default;
          this.state.hasZegoSupport = true;
          console.log('[SafeStreaming] ZegoCloud support available');
        }
      } catch (e) {
        console.warn('[SafeStreaming] ZegoCloud not available, using basic streaming');
        this.state.hasZegoSupport = false;
      }
    } catch (error) {
      console.error('[SafeStreaming] Zego detection error:', error);
      this.state.hasZegoSupport = false;
    }
  }

  public on(event: string, callback: Function) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event)?.push(callback);
    }
  }

  public off(event: string, callback: Function) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event) || [];
      const index = handlers.indexOf(callback);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[SafeStreaming] Error in ${event} handler:`, error);
      }
    });
  }

  public getState(): StreamingState {
    return { ...this.state };
  }

  public async startBroadcast(hostId: string, hostName: string, hostAvatar?: string): Promise<boolean> {
    try {
      const roomId = generateRoomId(hostId);
      
      this.state.roomId = roomId;
      this.state.isStreaming = true;
      this.state.host = {
        id: hostId,
        name: hostName,
        avatar: hostAvatar,
      };
      this.state.viewers = [];

      console.log('[SafeStreaming] Broadcast started:', {
        roomId,
        host: hostName,
        hasZegoSupport: this.state.hasZegoSupport,
      });

      this.emit('onStreamStarted', {
        roomId,
        host: this.state.host,
      });

      this.emit('onStateChanged', this.state);
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Broadcast error:', error);
      this.emit('onError', {
        code: 'BROADCAST_ERROR',
        message: String(error),
      });
      return false;
    }
  }

  public async stopBroadcast(): Promise<boolean> {
    try {
      const wasStreaming = this.state.isStreaming;
      
      this.state.isStreaming = false;
      this.state.host = null;
      this.state.viewers = [];
      this.state.roomId = '';

      if (wasStreaming) {
        console.log('[SafeStreaming] Broadcast stopped');
        this.emit('onStreamEnded', {});
        this.emit('onStateChanged', this.state);
      }

      return true;
    } catch (error) {
      console.error('[SafeStreaming] Stop error:', error);
      return false;
    }
  }

  public async joinStream(roomId: string, userId: string, userName: string): Promise<boolean> {
    try {
      if (!this.state.isStreaming || this.state.roomId !== roomId) {
        console.warn('[SafeStreaming] Room not available:', roomId);
        return false;
      }

      const viewer: StreamingUser = { id: userId, name: userName };
      this.state.viewers.push(viewer);

      console.log('[SafeStreaming] User joined:', userName);
      this.emit('onUserJoined', viewer);
      this.emit('onStateChanged', this.state);
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Join error:', error);
      return false;
    }
  }

  public async leaveStream(userId: string): Promise<boolean> {
    try {
      const index = this.state.viewers.findIndex(v => v.id === userId);
      if (index > -1) {
        const viewer = this.state.viewers.splice(index, 1)[0];
        console.log('[SafeStreaming] User left:', viewer.name);
        this.emit('onUserLeft', viewer);
        this.emit('onStateChanged', this.state);
      }
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Leave error:', error);
      return false;
    }
  }

  public toggleCamera(enabled: boolean): boolean {
    try {
      this.state.isCameraEnabled = enabled;
      console.log('[SafeStreaming] Camera toggled:', enabled ? 'ON' : 'OFF');
      this.emit('onCameraToggled', { enabled });
      this.emit('onStateChanged', this.state);
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Camera toggle error:', error);
      return false;
    }
  }

  public toggleMic(enabled: boolean): boolean {
    try {
      this.state.isMicEnabled = enabled;
      console.log('[SafeStreaming] Mic toggled:', enabled ? 'ON' : 'OFF');
      this.emit('onMicToggled', { enabled });
      this.emit('onStateChanged', this.state);
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Mic toggle error:', error);
      return false;
    }
  }

  public switchCamera(): boolean {
    try {
      this.state.isFrontCamera = !this.state.isFrontCamera;
      console.log('[SafeStreaming] Camera switched to:', this.state.isFrontCamera ? 'FRONT' : 'BACK');
      this.emit('onStateChanged', this.state);
      return true;
    } catch (error) {
      console.error('[SafeStreaming] Switch camera error:', error);
      return false;
    }
  }

  public isStreamingAvailable(): boolean {
    return this.state.hasZegoSupport;
  }

  public getViewerCount(): number {
    return this.state.viewers.length;
  }
}

export default SafeStreamingService;
