import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';

export default function LoginOptionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    const result = await signInWithApple();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  const handleTikTokSignIn = async () => {
    setLoading(true);
    try {
      console.log('Starting TikTok Sign-In...');
      const result = await signInWithTikTok();
      console.log('TikTok Sign-In Result:', JSON.stringify(result, null, 2));

      if (result.success) {
        console.log('TikTok Sign-In Success! Navigating to home...');
        await handleSocialAuthResult(result, router);
      } else {
        console.log('TikTok Sign-In Failed:', result.error);
      }
    } catch (error) {
      console.error('TikTok sign-in error:', error);
    }
    setLoading(false);
  };

  const handleSnapchatSignIn = async () => {
    setLoading(true);
    const result = await signInWithSnapchat();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Title Section */}
          <View style={styles.titleSection}>
            <View style={{ position: 'relative', height: 60, width: 220, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              {/* Base Text Logo - Always visible immediately */}
              <Text style={{
                fontSize: 36,
                fontWeight: '900',
                color: '#0A3D62',
                letterSpacing: -1
              }}>
                Trave<Text style={{ color: '#667eea' }}>Social</Text>
              </Text>

              {/* Branding Image - Loads on top if available */}
              <Image
                source={{ uri: 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png' }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'transparent'
                }}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.subtitle}>How would you like to login?</Text>
          </View>

          {/* Login Method Selection */}
          <View style={styles.methodContainer}>
            <CustomButton
              title="Phone"
              onPress={() => router.push('/auth/phone-login')}
              variant="primary"
              style={styles.methodButton}
            />

            <CustomButton
              title="Email"
              onPress={() => router.push('/auth/email-login')}
              variant="primary"
              style={styles.methodButton}
            />

            <CustomButton
              title="Username"
              onPress={() => router.push('/auth/username-login')}
              variant="secondary"
              style={styles.methodButton}
            />
          </View>

          {/* Social Login Options */}
          <View style={styles.socialSection}>
            <SocialButton
              provider="google"
              onPress={handleGoogleSignIn}
              style={styles.socialButton}
            />
            <SocialButton
              provider="apple"
              onPress={handleAppleSignIn}
              style={styles.socialButton}
            />
            <SocialButton
              provider="tiktok"
              onPress={handleTikTokSignIn}
              style={styles.socialButton}
            />
            <SocialButton
              provider="snapchat"
              onPress={handleSnapchatSignIn}
              style={styles.socialButton}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don&apos;t have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.push('/auth/signup-options')}
              >
                Sign up
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 10,
  },
  header: {
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  methodContainer: {
    marginBottom: 15,
  },
  methodButton: {
    marginBottom: 8,
  },
  socialSection: {
    marginBottom: 15,
  },
  socialButton: {
    marginBottom: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  footerLink: {
    color: '#0A3D62',
    fontWeight: '600',
  },
});

