import { increment, setDoc } from 'firebase/firestore';
import { logAnalyticsEvent } from '../lib/analytics';

jest.mock('../config/firebase', () => ({ db: {} }));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: () => null },
}));

jest.mock('firebase/firestore', () => {
  const setDoc = jest.fn(async () => undefined);
  const increment = jest.fn((v?: number) => ({ __increment: v ?? 1 }));
  const serverTimestamp = jest.fn(() => 'ts');
  const doc = jest.fn((...parts: string[]) => ({ path: parts.join('/') }));
  return { setDoc, increment, serverTimestamp, doc };
});

describe('analytics aggregation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-21T12:00:00Z'));
    (setDoc as jest.Mock).mockClear();
    (increment as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('increments daily counter and stores trimmed payload', async () => {
    await logAnalyticsEvent('app_open', { screen: 'home', extra: 'x'.repeat(2000) });
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, data] = (setDoc as jest.Mock).mock.calls[0];
    expect(data.eventName).toBe('app_open');
    expect(data.date).toBe('2025-12-21');
    expect(typeof data.count).toBe('object');
    expect(data.samplePayload!.length).toBeLessThanOrEqual(1000);
  });
});
