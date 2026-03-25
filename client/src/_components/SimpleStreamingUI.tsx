/**
 * Simple Streaming UI Component
 * Fallback UI when ZegoCloud is not available
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CameraControls from './CameraControls';
import { StreamingUser } from '../../services/implementations/SafeStreamingService';

interface SimpleStreamingUIProps {
  isHost: boolean;
  isStreaming: boolean;
  roomId: string;
  host: StreamingUser | null;
  viewers: StreamingUser[];
  viewerCount: number;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isFrontCamera: boolean;
  onStartBroadcast: () => void;
  onStopBroadcast: () => void;
  onJoinStream: () => void;
  onLeaveStream: () => void;
  onCameraToggle: (enabled: boolean) => void;
  onMicToggle: (enabled: boolean) => void;
  onCameraSwitch: () => void;
  loading: boolean;
}

export const SimpleStreamingUI: React.FC<SimpleStreamingUIProps> = ({
  isHost,
  isStreaming,
  roomId,
  host,
  viewers,
  viewerCount,
  isCameraEnabled,
  isMicEnabled,
  isFrontCamera,
  onStartBroadcast,
  onStopBroadcast,
  onJoinStream,
  onLeaveStream,
  onCameraToggle,
  onMicToggle,
  onCameraSwitch,
  loading,
}) => {
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#0891b2" style={{ marginTop: 50 }} />
        <Text style={styles.loadingText}>Initializing Streaming...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isHost ? 'Go Live' : 'Watch Live'}
          </Text>
          {isStreaming && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Stream Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={[styles.statusValue, { color: isStreaming ? '#10b981' : '#ef4444' }]}>
            {isStreaming ? 'Streaming Active' : 'Not Streaming'}
          </Text>
          {isStreaming && roomId && (
            <Text style={styles.roomIdText}>Room: {roomId.substring(0, 20)}...</Text>
          )}
        </View>

        {/* Camera Controls */}
        {isHost && isStreaming && (
          <CameraControls
            onCameraToggle={onCameraToggle}
            onMicToggle={onMicToggle}
            onCameraSwitch={onCameraSwitch}
            isCameraEnabled={isCameraEnabled}
            isMicEnabled={isMicEnabled}
            isFrontCamera={isFrontCamera}
          />
        )}

        {/* Host Info */}
        {host && (
          <View style={styles.hostCard}>
            <Text style={styles.hostLabel}>Broadcaster</Text>
            <Text style={styles.hostName}>{host.name}</Text>
          </View>
        )}

        {/* Viewers List */}
        {isStreaming && viewers.length > 0 && (
          <View style={styles.viewersSection}>
            <View style={styles.viewersHeader}>
              <Text style={styles.viewersTitle}>Viewers ({viewerCount})</Text>
            </View>
            <FlatList
              data={viewers}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.viewerItem}>
                  <View style={styles.viewerDot} />
                  <Text style={styles.viewerName}>{item.name}</Text>
                </View>
              )}
            />
          </View>
        )}

        {/* Empty Viewers State */}
        {isStreaming && viewers.length === 0 && (
          <View style={styles.emptyViewers}>
            <Feather name="users" size={48} color="#999" />
            <Text style={styles.emptyViewersText}>No viewers yet</Text>
            <Text style={styles.emptyViewersSubtext}>Share your stream to invite viewers</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {isHost ? (
            <>
              {!isStreaming ? (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={onStartBroadcast}
                >
                  <Feather name="video" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Start Broadcast</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.dangerButton]}
                  onPress={onStopBroadcast}
                >
                  <Feather name="stop-circle" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Stop Broadcast</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {!isStreaming ? (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={onJoinStream}
                >
                  <Feather name="play" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Join Stream</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.dangerButton]}
                  onPress={onLeaveStream}
                >
                  <Feather name="x-circle" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Leave Stream</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Feather name="info" size={20} color="#0891b2" />
          <Text style={styles.infoText}>
            {isHost
              ? 'Enable your camera and microphone to start broadcasting'
              : 'Join an active stream to watch'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0891b2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  roomIdText: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  hostCard: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  hostLabel: {
    fontSize: 12,
    color: '#075985',
    fontWeight: '600',
  },
  hostName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0284c7',
    marginTop: 4,
  },
  viewersSection: {
    marginBottom: 16,
  },
  viewersHeader: {
    marginBottom: 12,
  },
  viewersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  viewerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  viewerName: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  emptyViewers: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyViewersText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 12,
  },
  emptyViewersSubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  actionButtons: {
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#0891b2',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#ecf0ff',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0891b2',
  },
  infoText: {
    fontSize: 14,
    color: '#1e293b',
    marginLeft: 12,
    flex: 1,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
});

export default SimpleStreamingUI;
