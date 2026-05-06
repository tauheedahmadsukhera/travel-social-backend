import { BACKEND_URL, DEFAULT_AVATAR_URL } from '../api';

/**
 * Normalizes a media URL to ensure it has the correct protocol and base URL.
 * Handles Cloudinary, local backend paths, and various protocols.
 */
export const normalizeMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  
  // Handle already valid or special protocols
  if (
    lower.startsWith('http://') || 
    lower.startsWith('https://') || 
    lower.startsWith('data:') || 
    lower.startsWith('file:') || 
    lower.startsWith('ph:')
  ) {
    return trimmed;
  }

  // Handle protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Handle Cloudinary specific cases if they don't have protocol
  if (lower.includes('cloudinary.com')) {
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  // Handle local backend paths
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${BACKEND_URL}${cleanPath}`;
};

/**
 * Specifically normalizes user avatars, falling back to a default if needed.
 */
export const normalizeAvatarUrl = (url: string | null | undefined): string => {
  const normalized = normalizeMediaUrl(url);
  return normalized || DEFAULT_AVATAR_URL;
};

/**
 * Checks if a URL points to a video file.
 */
export const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.endsWith('.mp4') || 
    lower.endsWith('.mov') || 
    lower.endsWith('.avi') || 
    lower.endsWith('.mkv') ||
    lower.includes('video/upload') || // Cloudinary video pattern
    lower.includes('.m4v')
  );
};
