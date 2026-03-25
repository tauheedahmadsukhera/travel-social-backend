import type { ImageSourcePropType } from 'react-native';

type CategoryImageSource = ImageSourcePropType;

function normalizeCategoryName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isProbablyRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

function isPlaceholderUrl(url: string): boolean {
  const s = url.toLowerCase();
  return s.includes('via.placeholder.com') || s.includes('placehold.co');
}

export function getCategoryImageSource(
  name: string,
  remoteImageUrl?: string | null
): CategoryImageSource {
  const n = normalizeCategoryName(name);

  if (n.includes('beach')) return require('../assets/images/beach.jpg');
  if (n.includes('city') || n.includes('london')) return require('../assets/images/city.jpeg');
  if (n.includes('culture')) return require('../assets/images/culture.jpeg');
  if (n.includes('food')) return require('../assets/images/food.jpeg');
  if (n.includes('mountain') || n.includes('mount')) return require('../assets/images/mountain.jpeg');
  if (n.includes('nature')) return require('../assets/images/nature.jpeg');
  if (n.includes('nightlife') || n.includes('night life') || n.includes('night')) return require('../assets/images/nightlife.jpeg');
  if (n.includes('adventure')) return require('../assets/images/adventure.jpg');
  if (n.includes('travel')) return require('../assets/images/travel.jpeg');
  if (n.includes('winter') || n.includes('christmas') || n.includes('holiday')) return require('../assets/images/mountain.jpeg');

  if (isProbablyRemoteUrl(remoteImageUrl) && !isPlaceholderUrl(remoteImageUrl)) {
    return { uri: remoteImageUrl };
  }

  return require('../assets/images/travel.jpeg');
}
