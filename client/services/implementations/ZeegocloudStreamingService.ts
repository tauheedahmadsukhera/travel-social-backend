/**
 * ZeegoCloud Streaming Service
 * Using @zegocloud/zego-uikit-prebuilt-live-streaming-rn
 */

import { ZEEGOCLOUD_CONFIG, generateRoomId } from '../../config/zeegocloud';

export class ZeegocloudStreamingService {
  private static instance: ZeegocloudStreamingService;
  private roomId: string = '';
  private userId: string = '';
  private userName: string = '';
  private isHost: boolean = false;
  private eventHandlers: Map<string, Function[]> = new Map();

  private constructor() {
    this.initializeEventHandlers();
  }

  public static getInstance(): ZeegocloudStreamingService {
    if (!ZeegocloudStreamingService.instance) {
      ZeegocloudStreamingService.instance = new ZeegocloudStreamingService();
    }
    return ZeegocloudStreamingService.instance;
  }

  private initializeEventHandlers() {
    const events = ['onConnected', 'onDisconnected', 'onUserJoined', 'onUserLeft', 'onStreamStarted', 'onStreamEnded', 'onError'];
    events.forEach(event => this.eventHandlers.set(event, []));
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
        console.error(`❌ Error in ${event} handler:`, error);
      }
    });
  }

  public async initialize(userId: string, roomId?: string, userName?: string, isHost: boolean = false): Promise<boolean> {
    try {
      this.userId = userId;
      this.roomId = roomId || generateRoomId(userId);
      this.userName = userName || `User_${userId}`;
      this.isHost = isHost;

      console.log('✅ ZeegoCloud initialized:', { roomId: this.roomId, userId: this.userId, appID: ZEEGOCLOUD_CONFIG.appID });
      setTimeout(() => this.emit('onConnected', { roomId: this.roomId }), 100);
      return true;
    } catch (error) {
      console.error('❌ Initialization error:', error);
      this.emit('onError', { code: 'INIT_ERROR', message: String(error) });
      return false;
    }
  }

  public async startBroadcast(): Promise<boolean> {
    try {
      console.log('🎬 Starting broadcast...');
      this.emit('onStreamStarted', { roomId: this.roomId });
      return true;
    } catch (error) {
      console.error('❌ Broadcast error:', error);
      return false;
    }
  }

  public async stopBroadcast(): Promise<boolean> {
    try {
      console.log('⏹️ Stopping broadcast...');
      this.emit('onStreamEnded', { roomId: this.roomId });
      return true;
    } catch (error) {
      return false;
    }
  }

  public async joinAsViewer(): Promise<boolean> {
    try {
      this.emit('onUserJoined', { userId: this.userId });
      return true;
    } catch (error) {
      return false;
    }
  }

  public async leaveStream(): Promise<void> {
    try {
      this.emit('onUserLeft', { userId: this.userId });
      this.emit('onDisconnected', {});
    } catch (error) {
      console.error('❌ Leave error:', error);
    }
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getConfig() {
    return {
      appID: ZEEGOCLOUD_CONFIG.appID,
      appSign: ZEEGOCLOUD_CONFIG.appSign,
      roomID: this.roomId,
      userID: this.userId,
      userName: this.userName,
      isHost: this.isHost,
    };
  }

  public isConnected(): boolean {
    return this.roomId !== '';
  }

  public getProvider(): string {
    return 'zeegocloud';
  }

  public async disconnect(): Promise<void> {
    await this.leaveStream();
    this.roomId = '';
    this.userId = '';
  }
}

export default ZeegocloudStreamingService;
