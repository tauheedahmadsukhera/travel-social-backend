import { decryptMessage, encryptMessage, hashString, verifyMessageIntegrity } from '../lib/encryption';

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(async (length: number) => {
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      arr[i] = (i + 1) % 256;
    }
    return arr;
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digest: jest.fn(async (_algo: any, bytes: Uint8Array | ArrayBuffer) => {
    // Simple deterministic digest: SHA-like but fixed pattern for test stability
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    const out = new Uint8Array(32);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = arr[i % arr.length] ^ 0x5a; // repeat and xor for variation
    }
    return out.buffer;
  }),
}));

describe('encryption', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars
  const message = 'Hello secure world!';

  it('encrypts and decrypts symmetrically', async () => {
    const encrypted = await encryptMessage(message, key);
    expect(encrypted.text).not.toEqual(message);
    expect(encrypted.iv).toHaveLength(32); // 16 bytes hex
    expect(encrypted.algorithm).toBe('AES-256-CBC-HMAC');
    expect(encrypted.tag).toHaveLength(64);

    const decrypted = await decryptMessage(encrypted, key);
    expect(decrypted).toEqual(message);
  });

  it('verifies message integrity correctly', async () => {
    const encrypted = await encryptMessage(message, key);
    const decrypted = await decryptMessage(encrypted, key);
    expect(verifyMessageIntegrity(message, decrypted)).toBe(true);
    expect(verifyMessageIntegrity(message, decrypted + '!')).toBe(false);
  });

  it('hashes strings to hex', async () => {
    const digest = await hashString('abc');
    expect(digest).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(digest)).toBe(true);
  });
});
