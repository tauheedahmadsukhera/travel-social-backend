import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';

export default function SignUpOptionsScreen() {
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
    const result = await signInWithTikTok();
    await handleSocialAuthResult(result, router);
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
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#0A3D62', letterSpacing: -1 }}>
                Trave<Text style={{ color: '#667eea' }}>Social</Text>
              </Text>
              <Image
                source={{ uri: 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png' }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.subtitle}>Let&apos;s keep it quick, 2 steps and you&apos;re in.</Text>
          </View>

          {/* Method Selection */}
          <View style={styles.methodContainer}>
            <Text style={styles.methodLabel}>By Email</Text>
            <CustomButton
              title="Email"
              onPress={() => router.push('/auth/email-signup')}
              variant="primary"
              style={styles.methodButton}
              textStyle={styles.methodButtonText}
            />

            <Text style={styles.methodLabel}>By phone number</Text>
            <CustomButton
              title="Phone"
              onPress={() => router.push('/auth/phone-signup')}
              variant="primary"
              style={styles.methodButton}
              textStyle={styles.methodButtonText}
            />

            <Text style={styles.methodLabel}>By username</Text>
            <CustomButton
              title="Username"
              onPress={() => router.push('/auth/username-signup')}
              variant="secondary"
              style={styles.methodButton}
              textStyle={styles.methodButtonText}
            />
          </View>

          {/* Social Login Options */}
          <View style={styles.socialContainer}>
            <SocialButton
              provider="google"
              onPress={handleGoogleSignIn}
            />
            <SocialButton
              provider="apple"
              onPress={handleAppleSignIn}
            />
            <SocialButton
              provider="tiktok"
              onPress={handleTikTokSignIn}
            />
            <SocialButton
              provider="snapchat"
              onPress={handleSnapchatSignIn}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              You have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.push('/auth/login-options')}
              >
                Log in
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
    justifyContent: 'center',
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  methodContainer: {
    marginBottom: 15,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
    marginTop: 8,
  },
  methodButton: {
    marginBottom: 4,
  },
  methodButtonText: {
    fontSize: 15,
  },
  socialContainer: {
    marginBottom: 15,
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

