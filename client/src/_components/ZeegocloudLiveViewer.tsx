/**
 * ZeegoCloud Live Streaming Viewer Component
 * For viewers to watch live streams
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ZEEGOCLOUD_CONFIG } from '../../config/zeegocloud';

interface ZeegocloudLiveViewerProps {
  roomID: string;
  userID: string;
  userName: string;
  onLeave?: () => void;
}

type ZegoSdkBundle = {
  ZegoUIKitPrebuiltLiveStreaming: any;
  AUDIENCE_DEFAULT_CONFIG: any;
};

function loadZegoSdk(): ZegoSdkBundle | null {
  try {
    // Dynamic require to avoid crashing when native module is missing (e.g., Expo Go).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@zegocloud/zego-uikit-prebuilt-live-streaming-rn');
  } catch (error) {
    console.warn('Zego SDK not available in this runtime. Use a dev client or native build.', error);
    return null;
  }
}

export default function ZeegocloudLiveViewer({ 
  roomID, 
  userID, 
  userName,
  onLeave 
}: ZeegocloudLiveViewerProps) {
  const [sdk, setSdk] = useState<ZegoSdkBundle | null>(null);

  useEffect(() => {
    setSdk(loadZegoSdk());
  }, []);
  // Guard against null/empty values that cause Zego SDK to crash when building the prefix string
  const resolved = useMemo(() => {
    const appID = Number(ZEEGOCLOUD_CONFIG?.appID);
    const appSign = ZEEGOCLOUD_CONFIG?.appSign || '';
    const liveID = roomID || '';
    const uid = userID || `viewer_${Date.now()}`;
    const name = userName || 'Viewer';

    const isValid = Boolean(appID && appSign && liveID);
    return { appID, appSign, liveID, uid, name, isValid };
  }, [roomID, userID, userName]);

  if (!resolved.isValid) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Unable to start live stream viewer. Missing credentials or room/user info.
        </Text>
      </View>
    );
  }

  if (!sdk) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Live viewer is unavailable in this runtime. Install and run a custom dev client or a full native build that includes the Zego SDK.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <sdk.ZegoUIKitPrebuiltLiveStreaming
        appID={resolved.appID}
        appSign={resolved.appSign}
        userID={resolved.uid}
        userName={resolved.name}
        liveID={resolved.liveID}
        config={{
          ...sdk.AUDIENCE_DEFAULT_CONFIG,
          onLeaveLiveStreaming: () => {
            console.log('👋 Viewer left live stream');
            onLeave?.();
          },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorText: {
    marginTop: 24,
    paddingHorizontal: 16,
    color: '#fff',
    textAlign: 'center',
  },
});

