import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AppBrandMark } from '@/src/_components/AppBrandMark';

export type AuthBrandHeaderProps = {
  /** Extra top spacing like `welcome.tsx` header (logo + first line). */
  variant?: 'welcome' | 'default';
  /** Bold line under the logo (e.g. screen title). */
  title?: string;
  /** Grey helper line — same typography as welcome subtitle. */
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
};

/**
 * Shared auth hero: always bundled `logo-trips-mark.png` (same on iOS/Android; avoids stale /branding CDN).
 */
export function AuthBrandHeader({
  variant = 'default',
  title,
  subtitle,
  children,
  style,
}: AuthBrandHeaderProps) {
  const resolvedTitle = title ?? 'Trips';
  return (
    <View style={[variant === 'welcome' ? styles.welcomeOuter : styles.defaultOuter, style]}>
      <View style={styles.markWrap}>
        {/* Render only the mark here; title is rendered as text below to avoid double-wordmark glitches on iOS. */}
        <AppBrandMark size="lg" iconAsset="mark" showWordmark={false} />
      </View>
      {resolvedTitle ? <Text style={styles.title}>{resolvedTitle}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeOuter: {
    alignItems: 'center',
    marginTop: 56,
    marginBottom: 10,
  },
  defaultOuter: {
    alignItems: 'center',
  },
  markWrap: {
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
