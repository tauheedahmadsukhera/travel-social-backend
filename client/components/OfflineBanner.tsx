import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOfflineBanner } from '../hooks/useOffline';

/**
 * Offline Banner Component
 * Shows connection status to user
 */
export function OfflineBanner() {
  const { showBanner, isOnline } = useOfflineBanner();

  if (!showBanner) return null;

  return (
    <View style={[styles.banner, isOnline ? styles.online : styles.offline]}>
      <Text style={styles.text}>
        {isOnline ? '✓ Back online' : '⚠ No internet connection'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    backgroundColor: '#ff9800',
  },
  online: {
    backgroundColor: '#4caf50',
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
