import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { Stack } from "expo-router";
// import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, Text as RNText, View } from "react-native";
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from "../components/ErrorBoundary";
// import { auth } from "../config/firebase";
// import { initSentry } from "../lib/sentry";
import { UserProvider } from "@/src/_components/UserContext";

let setupNotificationListeners: any = () => {};
let initializeBackend: any = () => Promise.resolve();

// Safely load services with error handling
try {
  const notificationModule = require("../services/notificationHandler");
  setupNotificationListeners = notificationModule.setupNotificationListeners || (() => {});
} catch (e) {
  console.warn('[RootLayout] Failed to load notification handler:', e);
}

try {
  const backendModule = require("@/src/_services/backendWakeup");
  initializeBackend = backendModule.initializeBackend || (() => Promise.resolve());
} catch (e) {
  console.warn('[RootLayout] Failed to load backend wakeup:', e);
}
// Suppress non-critical warnings
LogBox.ignoreLogs([
  'Unable to activate keep awake',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'ViewPropTypes will be removed',
  'Native part of Reanimated doesn\'t seem to be initialized', // Suppress in Expo Go
]);

if (typeof globalThis !== 'undefined' && !(globalThis as any).__traveUnhandledRejectionGuardInstalled) {
  (globalThis as any).__traveUnhandledRejectionGuardInstalled = true;
  (globalThis as any).onunhandledrejection = (event: any) => {
    try {
      const msg = String(event?.reason?.message ?? event?.reason ?? '');
      if (msg.toLowerCase().includes('unable to activate keep awake')) {
        if (typeof event?.preventDefault === 'function') event.preventDefault();
        return;
      }
    } catch {}
  };
}

// Silence noisy logs in production for performance
if (!__DEV__) {
  const noop = () => {};
  // Keep warn/error visible
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.debug = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.time = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.timeEnd = noop as any;
}

// initSentry();

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [initError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          ...Ionicons.font,
        });
        setFontsLoaded(true);
      } catch (error) {
        console.log('Font loading error:', error);
        setFontsLoaded(true); // Continue anyway
      }
    }
    loadFonts();
  }, []);

  // Initialize backend on app start (wake up if sleeping)
  useEffect(() => {
    try {
      initializeBackend().catch((err: any) => {
        console.warn('Backend initialization failed:', err);
      });
    } catch (error) {
      console.warn('Error calling initializeBackend:', error);
    }
    
    // Setup notification listeners
    try {
      if (typeof setupNotificationListeners === 'function') {
        setupNotificationListeners();
      }
    } catch (error) {
      console.warn('Notification listener setup failed:', error);
    }
  }, []);

  useEffect(() => {
    // Keep startup overlay visible until fonts are ready.
    setLoading(false);
  }, []);

  return (
    <ErrorBoundary>
      <UserProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/welcome" />
            <Stack.Screen name="auth/login-options" />
            <Stack.Screen name="auth/phone-login" />
            <Stack.Screen name="auth/email-login" />
            <Stack.Screen name="auth/username-login" />
            <Stack.Screen name="auth/signup-options" />
            <Stack.Screen name="auth/phone-signup" />
            <Stack.Screen name="auth/email-signup" />
            <Stack.Screen name="auth/username-signup" />
            <Stack.Screen name="auth/phone-otp" />
            <Stack.Screen name="auth/forgot-password" />
            <Stack.Screen name="auth/reset-otp" />
            <Stack.Screen name="auth/reset-password" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="create-post" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="search-modal" options={{ headerShown: false, animation: 'slide_from_right' }} />
            <Stack.Screen name="inbox" options={{ headerShown: false }} />
            <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
            <Stack.Screen name="passport" options={{ headerShown: false }} />
            <Stack.Screen name="dm" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="go-live" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
            <Stack.Screen name="watch-live" options={{ headerShown: false }} />
          </Stack>

          {(loading || !fontsLoaded || !!initError) && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#fff',
              }}
            >
              <ActivityIndicator size="large" color="#667eea" />
              {initError && (
                <View style={{ marginTop: 20, padding: 20 }}>
                  <RNText style={{ color: 'red', textAlign: 'center' }}>
                    Initialization Error: {initError}
                  </RNText>
                </View>
              )}
            </View>
          )}
        </GestureHandlerRootView>
      </UserProvider>
    </ErrorBoundary>
  );
}
