/**
 * Message Encryption & Decryption
 * End-to-End Encryption for DM Security
 * Uses React Native Crypto for encryption
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

export interface EncryptedMessage {
  text: string;
  iv: string; // 128-bit IV
  salt: string; // reserved for future key-derivation
  tag: string; // HMAC-SHA256 for authenticity
  algorithm: string; // 'AES-256-CBC-HMAC'
}

export interface DecryptedMessage {
  text: string;
  encrypted: boolean;
}

/**
 * Generate or retrieve user's encryption key from local storage
 */
export async function getOrCreateEncryptionKey(userId: string): Promise<string> {
  const storageKey = `encryption_key_${userId}`;
  
  try {
    // Try to get existing key
    const storedKey = await AsyncStorage.getItem(storageKey);
    
    if (storedKey) {
      return storedKey;
    }
    
    // Generate new 256-bit key
    const randomBytes = await Crypto.getRandomBytes(32);
    const hexKey = Array.from(new Uint8Array(randomBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
      
    // Store securely
    await AsyncStorage.setItem(storageKey, hexKey);
    console.log('🔐 Generated new encryption key for user:', userId);
    
    return hexKey;
  } catch (error) {
    console.error('Error managing encryption key:', error);
    throw new Error('Failed to manage encryption key');
  }
}

/**
 * Encrypt a message using AES-256-CBC with HMAC-SHA256
 * @param plaintext Message text to encrypt
 * @param key Encryption key (256-bit)
 * @returns Encrypted message with IV and salt
 */
export async function encryptMessage(plaintext: string, key: string): Promise<EncryptedMessage> {
  try {
    if (!plaintext || !key) {
      throw new Error('Plaintext and key are required');
    }

    const iv = CryptoJS.lib.WordArray.random(16); // 128-bit IV
    const keyWords = parseKey(key);
    const encrypted = CryptoJS.AES.encrypt(plaintext, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const cipherHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
    const ivHex = iv.toString(CryptoJS.enc.Hex);
    const tag = computeTag(cipherHex, ivHex, keyWords);

    return {
      text: cipherHex,
      iv: ivHex,
      salt: '',
      tag,
      algorithm: 'AES-256-CBC-HMAC',
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Decrypt a message
 * @param encryptedMessage Encrypted message object
 * @param key Encryption key
 * @returns Decrypted message text
 */
export async function decryptMessage(
  encryptedMessage: EncryptedMessage,
  key: string
): Promise<string> {
  try {
    if (!encryptedMessage?.text || !key) {
      throw new Error('Encrypted message and key are required');
    }

    const keyWords = parseKey(key);
    // Backward compatibility: older messages may not have tag
    if (encryptedMessage.tag) {
      const expectedTag = computeTag(encryptedMessage.text, encryptedMessage.iv, keyWords);
      if (!timingSafeEqualHex(expectedTag, encryptedMessage.tag || '')) {
        throw new Error('Decryption failed');
      }
    }

    const decrypted = CryptoJS.AES.decrypt(
      {
        ciphertext: CryptoJS.enc.Hex.parse(encryptedMessage.text),
      } as any,
      keyWords,
      {
        iv: CryptoJS.enc.Hex.parse(encryptedMessage.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plaintext) {
      throw new Error('Decryption failed');
    }

    return plaintext;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}

function parseKey(hexKey: string): CryptoJS.lib.WordArray {
  const clean = hexKey.trim();
  if (clean.length < 64) {
    throw new Error('Encryption key is too short');
  }
  return CryptoJS.enc.Hex.parse(clean.slice(0, 64)); // 256-bit key
}

function computeTag(cipherHex: string, ivHex: string, key: CryptoJS.lib.WordArray): string {
  return CryptoJS.HmacSHA256(ivHex + cipherHex, key).toString(CryptoJS.enc.Hex);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Hash a string using SHA-256
 */
export async function hashString(text: string): Promise<string> {
  try {
    const textBytes = new TextEncoder().encode(text);
    const digestBuffer = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      textBytes
    );
    
    // Convert ArrayBuffer to hex string
    const digestBytes = new Uint8Array(digestBuffer);
    const digest = Array.from(digestBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return digest;
  } catch (error) {
    console.error('Hash error:', error);
    throw error;
  }
}

/**
 * Verify encrypted message integrity
 */
export function verifyMessageIntegrity(
  original: string,
  decrypted: string
): boolean {
  return original === decrypted;
}

/**
 * Encrypt all messages in a conversation
 * Used during migration or bulk encryption
 */
export async function bulkEncryptMessages(
  messages: any[],
  key: string
): Promise<any[]> {
  try {
    const encrypted = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.encrypted) {
          const encMsg = await encryptMessage(msg.text, key);
          return {
            ...msg,
            originalText: msg.text,
            text: encMsg.text,
            iv: encMsg.iv,
            salt: encMsg.salt,
            tag: encMsg.tag,
            algorithm: encMsg.algorithm,
            encrypted: true,
          };
        }
        return msg;
      })
    );
    return encrypted;
  } catch (error) {
    console.error('Bulk encryption error:', error);
    throw error;
  }
}

export default {
  getOrCreateEncryptionKey,
  encryptMessage,
  decryptMessage,
  hashString,
  verifyMessageIntegrity,
  bulkEncryptMessages,
};
