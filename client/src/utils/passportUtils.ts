export const normalizeCountryName = (value?: string | null): string => {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const getCountryFromAddress = (address?: string | null): string | null => {
  if (!address) return null;
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};

export const PLUS_CODE_PATTERN = /[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i;
export const COORDINATE_PATTERN = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/;

export const isReadableLocationLabel = (value?: string | null): boolean => {
  if (!value) return false;
  const label = String(value).trim();
  if (!label) return false;
  if (PLUS_CODE_PATTERN.test(label)) return false;
  if (COORDINATE_PATTERN.test(label)) return false;
  const lower = label.toLowerCase();
  if (lower === 'unknown' || lower === 'unknown place' || lower === 'n/a') return false;
  return true;
};

export const getSuggestionLocationLabel = (suggestion: any): string => {
  if (!suggestion) return 'this location';

  const main = suggestion?.mainSuggestion || {};
  const candidates: Array<string | undefined> = [
    main?.name,
    main?.place,
    main?.placeName,
    main?.parentCity,
    main?.parentCountry,
  ];

  if (Array.isArray(suggestion?.suggestions)) {
    for (const s of suggestion.suggestions) {
      candidates.push(s?.name, s?.place, s?.placeName, s?.parentCity, s?.parentCountry);
    }
  }

  for (const candidate of candidates) {
    if (isReadableLocationLabel(candidate)) {
      return String(candidate).trim();
    }
  }

  return 'this location';
};
