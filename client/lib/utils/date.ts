import { formatDistanceToNow, format } from 'date-fns';

/**
 * Robust date parsing for various formats (Date, string, number, Firestore timestamp)
 */
export const toDate = (input: any): Date | null => {
  try {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    
    if (typeof input === 'number') {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }
    
    if (typeof input === 'string') {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }
    
    // Firestore-like timestamp
    if (input?.toDate && typeof input.toDate === 'function') {
      const d = input.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    
    // MongoDB/JSON date formats
    if (input?._seconds != null) {
      const ms = Number(input._seconds) * 1000 + Math.floor(Number(input._nanoseconds || 0) / 1e6);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    
    if (input?.$date != null) {
      const d = new Date(input.$date);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/**
 * Returns a relative time string (e.g., "2 hours ago")
 */
export const getRelativeTime = (date: any): string => {
  const d = toDate(date);
  if (!d) return 'Just now';
  return formatDistanceToNow(d, { addSuffix: true });
};

/**
 * Formats a date for Passport stamps or display
 */
export const formatDisplayDate = (date: any, formatStr: string = 'dd MMM yyyy'): string => {
  const d = toDate(date);
  if (!d) return '';
  return format(d, formatStr);
};
