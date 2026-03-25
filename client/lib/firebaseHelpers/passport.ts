// Passport ticket helpers
import { API_BASE_URL } from '../api';

export interface Stamp {
  _id: string;
  type: 'country' | 'city' | 'place';
  name: string;
  countryCode?: string;
  parentCountry?: string;
  parentCity?: string;
  lat: number;
  lon: number;
  count: number;
  visitHistory: { visitedAt: string | number; lat: number; lon: number }[];
  postCount?: number;
  createdAt: string | number;
}

export async function getPassportData(userId: string) {
  try {
    const url = `${API_BASE_URL}/users/${userId}/passport`;
    console.log('📡 [Passport] Calling API URL:', url);
    const res = await fetch(url);
    console.log('📡 [Passport] API Response Status:', res.status);
    const data = await res.json();
    console.log('📡 [Passport] API Data Stamps Count:', data.data?.stamps?.length || 0);
    return data.data || { stamps: [], ticketCount: 0 };
  } catch (error: any) {
    console.error('❌ [Passport] Error fetching passport:', error);
    return { stamps: [], ticketCount: 0 };
  }
}

export async function addPassportStamp(userId: string, data: {
  type: 'country' | 'city' | 'place';
  name: string;
  countryCode?: string;
  parentCountry?: string;
  parentCity?: string;
  lat: number;
  lon: number;
}) {
  try {
    console.log('📡 [Passport] Adding stamp for user:', userId, data.name);
    const url = `${API_BASE_URL}/users/${userId}/passport/locations`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    return await res.json();
  } catch (error: any) {
    console.error('❌ [Passport] Error adding stamp:', error);
    return { success: false, error: error.message || 'Network request failed' };
  }
}

export async function deletePassportStamp(userId: string, stampId: string) {
  try {
    console.log('📡 [Passport] Deleting stamp:', stampId);
    const url = `${API_BASE_URL}/users/${userId}/passport/stamps/${stampId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    return await res.json();
  } catch (error: any) {
    console.error('❌ [Passport] Error deleting stamp:', error);
    return { success: false, error: error.message || 'Network request failed' };
  }
}
