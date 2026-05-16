import { renderHook, act } from '@testing-library/react-native';
import { useLiveStream } from '../useLiveStream';
import { auth } from '../../config/firebase';
import ZeegocloudStreamingService from '../../services/implementations/ZeegocloudStreamingService';
import { startLiveStream, endLiveStream } from '../../lib/firebaseHelpers/live';

jest.mock('../../config/firebase', () => ({
  auth: { currentUser: { uid: 'user123', displayName: 'Test User', photoURL: 'avatar_url' } },
}));
jest.mock('../../services/implementations/ZeegocloudStreamingService');
jest.mock('../../lib/firebaseHelpers/live');
jest.mock('../../utils/logger');

describe('useLiveStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useLiveStream());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isInitializing).toBe(false);
  });

  it('should start a stream successfully', async () => {
    const mockService = {
      initialize: jest.fn().mockResolvedValue(true),
      startBroadcast: jest.fn().mockResolvedValue(true),
    };
    (ZeegocloudStreamingService.getInstance as jest.Mock).mockReturnValue(mockService);
    (startLiveStream as jest.Mock).mockResolvedValue({ success: true, id: 'stream123' });

    const { result } = renderHook(() => useLiveStream());

    await act(async () => {
      const success = await result.current.startStream('user123', 'My Live', { lat: 0, lng: 0 });
      expect(success).toBe(true);
    });

    expect(result.current.isStreaming).toBe(true);
    expect(mockService.initialize).toHaveBeenCalled();
    expect(mockService.startBroadcast).toHaveBeenCalled();
  });

  it('should end a stream successfully', async () => {
    const mockService = {
      stopBroadcast: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
    };
    (ZeegocloudStreamingService.getInstance as jest.Mock).mockReturnValue(mockService);
    (endLiveStream as jest.Mock).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useLiveStream());

    // Manually set streaming state for the test (or start it)
    await act(async () => {
      const success = await result.current.endStream();
      expect(success).toBe(true);
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
