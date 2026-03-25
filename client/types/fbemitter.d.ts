declare module 'fbemitter' {
  export class EventEmitter {
    addListener(eventType: string, listener: (...args: any[]) => void): any;
    emit(eventType: string, ...args: any[]): void;
    removeListener(token: any): void;
    removeAllListeners(eventType?: string): void;
  }
}
