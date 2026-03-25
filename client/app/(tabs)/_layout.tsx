import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from 'expo-image';
import { Tabs, useFocusEffect, useRouter, usePathname, useSegments } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View, FlatList, Modal, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '../../hooks/useNotifications';
import { notificationService } from '../../lib/notificationService';
import { getPushNotificationToken, requestNotificationPermissions, savePushToken } from '../../services/notificationService';
import GroupsDrawer from '@/src/_components/GroupsDrawer';
import NotificationsModal from '@/src/_components/NotificationsModal';

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { logAnalyticsEvent, setAnalyticsUserId } from '../../lib/analytics';
import { getUserConversations } from '../../lib/firebaseHelpers/conversation';
import { getUserNotifications } from '../../lib/firebaseHelpers/notification';
import { logoutUser } from '@/src/_services/firebaseAuthService';
import fetchLogoUrl from '@/src/_services/brandingService';
import { getNotificationDisplayText } from '../../lib/notificationText';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const isLargeDevice = SCREEN_WIDTH >= 414;
const ICON_SIZE = isSmallDevice ? 18 : (isLargeDevice ? 22 : 20);
const CHEVRON_SIZE = isSmallDevice ? 18 : 20;

const TAB_ACTIVE_COLOR = '#0A3D62';
const TAB_INACTIVE_COLOR = '#000000';
const TAB_LABEL_SIZE = 11;
const TOP_MENU_HEIGHT = isSmallDevice ? 50 : 56;

// Create a context for tab events
const TabEventContext = createContext<{ emitHomeTabPress: () => void; subscribeHomeTabPress: (cb: () => void) => () => void } | undefined>(undefined);

type HeaderVisibilityApi = {
  hideHeader: () => void;
  showHeader: () => void;
};

const HeaderVisibilityContext = createContext<HeaderVisibilityApi | undefined>(undefined);

export const useHeaderVisibility = (): HeaderVisibilityApi => {
  const ctx = useContext(HeaderVisibilityContext);
  if (!ctx) {
    return {
      hideHeader: () => { },
      showHeader: () => { },
    };
  }
  return ctx;
};

export const useTabEvent = () => useContext(TabEventContext);

export default function TabsLayout() {
  // Simple subscription system for home tab press
  const homeTabPressListeners = useRef<(() => void)[]>([]);
  const emitHomeTabPress = () => {
    homeTabPressListeners.current.forEach(cb => cb());
  };
  const subscribeHomeTabPress = (cb: () => void) => {
    homeTabPressListeners.current.push(cb);
    return () => {
      homeTabPressListeners.current = homeTabPressListeners.current.filter(fn => fn !== cb);
    };
  };
  const router = useRouter();
  const pathname = usePathname();
  const [menuVisible, setMenuVisible] = useState(false);
  const [groupsDrawerVisible, setGroupsDrawerVisible] = useState(false);
  const isSearchScreen = pathname === '/search' || pathname.includes('/search');
  const insets = useSafeAreaInsets();

  const headerHeightRef = useRef<number>(TOP_MENU_HEIGHT);
  const animatedHeaderHeight = useRef(new Animated.Value(TOP_MENU_HEIGHT)).current;
  const animatedHeaderTranslateY = useRef(new Animated.Value(0)).current;

  const applyHeaderState = useCallback((hidden: boolean) => {
    const h = headerHeightRef.current;
    if (!h) return;

    Animated.parallel([
      Animated.timing(animatedHeaderHeight, {
        toValue: hidden ? 0 : h,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(animatedHeaderTranslateY, {
        toValue: hidden ? -h : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [animatedHeaderHeight, animatedHeaderTranslateY]);

  const hideHeader = useCallback(() => {
    applyHeaderState(true);
  }, [applyHeaderState]);

  const showHeader = useCallback(() => {
    applyHeaderState(false);
  }, [applyHeaderState]);

  const headerVisibilityValue = useMemo(() => {
    return { hideHeader, showHeader };
  }, [hideHeader, showHeader]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      {!isSearchScreen && (
        <Animated.View
          style={{
            height: animatedHeaderHeight,
            transform: [{ translateY: animatedHeaderTranslateY }],
            overflow: 'hidden',
          }}
        >
          <TopMenu setMenuVisible={setMenuVisible} setGroupsDrawerVisible={setGroupsDrawerVisible} />
        </Animated.View>
      )}

      <HeaderVisibilityContext.Provider value={headerVisibilityValue}>
        <TabEventContext.Provider value={{ emitHomeTabPress, subscribeHomeTabPress }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: TAB_ACTIVE_COLOR,
              tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
              tabBarShowLabel: true,
              tabBarItemStyle: {
                flex: 1,
              },
              tabBarLabelStyle: {
                fontSize: TAB_LABEL_SIZE,
                marginTop: 2,
              },
              lazy: true,
              freezeOnBlur: true,
              tabBarStyle: {
                height: 70,
                paddingBottom: 10,
                paddingTop: 8,
                paddingHorizontal: 12,
                backgroundColor: '#FFFFFF',
                borderTopWidth: 1,
                borderTopColor: '#D8DCE0',
                elevation: 0,
                shadowOpacity: 0,
              },
            }}
          >
            <Tabs.Screen
              name="home"
              listeners={{
                tabPress: () => {
                  emitHomeTabPress();
                  logAnalyticsEvent('tab_home_press', {});
                },
              }}
              options={{
                title: "Home",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                },
                tabBarIcon: ({ color, focused }) => (
                  <MaterialCommunityIcons
                    name={focused ? 'home' : 'home-outline'}
                    size={ICON_SIZE + 4}
                    color={color}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="search"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_search_press', {});
                },
              }}
              options={{
                title: "Search",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                },
                tabBarIcon: ({ color }) => (
                  <Ionicons name="search" size={ICON_SIZE + 2} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="post"
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  logAnalyticsEvent('tab_post_press', {});
                  router.push('/create-post');
                },
              }}
              options={{
                title: "Post",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                },
                tabBarIcon: ({ color }) => (
                  <Ionicons name="add" size={ICON_SIZE + 6} color={TAB_INACTIVE_COLOR} />
                ),
              }}
            />
            <Tabs.Screen
              name="map"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_map_press', {});
                },
              }}
              options={{
                title: "Map",
                tabBarButton: () => null,
                tabBarItemStyle: {
                  display: 'none',
                },
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons name={focused ? "map" : "map-outline"} size={ICON_SIZE} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="saved"
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  logAnalyticsEvent('tab_saved_press', {});
                  // Force navigate to the base route without params
                  router.replace('/(tabs)/saved');
                },
              }}
              options={{
                title: "Saved",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                },
                tabBarIcon: ({ color }) => (
                  <Feather
                    name="bookmark"
                    size={ICON_SIZE + 2}
                    color={color}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_profile_press', {});
                },
              }}
              options={{
                title: "Profile",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                },
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'person-circle' : 'person-circle-outline'}
                    size={ICON_SIZE + 2}
                    color={color}
                  />
                ),
              }}
            />
          </Tabs>
        </TabEventContext.Provider>
      </HeaderVisibilityContext.Provider>

      {/* Modern clean bottom sheet for settings/activity */}
      {menuVisible && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={{ flex: 1, width: '100%' }}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          />
          <View style={{ width: '100%' }}>
            <View style={[styles.igSheet, { paddingBottom: Math.max(insets.bottom, isSmallDevice ? 24 : 32) + 12 }]}>
              {/* Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.igHandle} />
              </View>

              {/* Menu Items Container */}
              <View style={styles.menuItemsContainer}>
                {/* Settings Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_settings'); setMenuVisible(false); router.push('/settings'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="settings" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Settings</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Content Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_saved'); setMenuVisible(false); router.push('/saved'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="bookmark" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Saved Posts</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Legal Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_privacy'); setMenuVisible(false); router.push('/legal/privacy'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="shield" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Privacy Policy</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>

                  <View style={styles.separator} />

                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_terms'); setMenuVisible(false); router.push('/legal/terms'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="file-text" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Terms of Service</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                  style={styles.igItemLogout}
                  activeOpacity={0.7}
                  onPress={async () => {
                    setMenuVisible(false);
                    try {
                      logAnalyticsEvent('logout');
                      // Import and use actual logout function
                      const { logoutUser } = await import('@/src/_services/firebaseAuthService');
                      const result = await logoutUser();
                      if (result.success) {
                        console.log('Logged out successfully');
                        router.replace('/auth/welcome');
                      } else {
                        Alert.alert('Error', 'Logout failed');
                      }
                    } catch (error) {
                      console.error('Logout error:', error);
                      Alert.alert('Error', 'Failed to log out. Please try again.');
                    }
                  }}
                >
                  <View style={[styles.iconContainer, { backgroundColor: '#fee' }]}>
                    <Feather name="log-out" size={ICON_SIZE} color="#e74c3c" />
                  </View>
                  <Text style={styles.igTextLogout}>Log Out</Text>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.cancelButton}
                  activeOpacity={0.7}
                  onPress={() => { logAnalyticsEvent('close_menu'); setMenuVisible(false); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Groups Drawer */}
      <GroupsDrawer visible={groupsDrawerVisible} onClose={() => setGroupsDrawerVisible(false)} />
    </SafeAreaView >
  );
}

function TopMenu({ setMenuVisible, setGroupsDrawerVisible }: { setMenuVisible: (v: boolean) => void; setGroupsDrawerVisible: (v: boolean) => void }): React.ReactElement {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [unreadMsg, setUnreadMsg] = useState(0);

  const [notificationsModalVisible, setNotificationsModalVisible] = React.useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>('https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png');
  const [logoLoading, setLogoLoading] = useState(false);
  const segments = useSegments();
  const isProfileScreen = segments[segments.length - 1] === 'profile';

  // Get notifications from hook
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead } = useNotifications(currentUserId || '');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        if (isMounted && uid) setCurrentUserId(String(uid));
      } catch { }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!currentUserId) return;
      try {
        const perm = await requestNotificationPermissions();
        if (!perm?.success) return;
        const tokenRes = await getPushNotificationToken();
        if (!tokenRes?.success || !tokenRes?.token) return;
        await savePushToken(currentUserId, tokenRes.token);
      } catch { }
    })();
    return () => { isMounted = false; };
  }, [currentUserId]);

  useEffect(() => {
    const u = currentUserId;
    if (u) setAnalyticsUserId(u);
  }, [currentUserId]);

  useEffect(() => {
    let isMounted = true;
    fetchLogoUrl().then((url: string | null) => {
      if (isMounted) {
        setLogoUrl(url);
        setLogoLoading(false);
      }
    }).catch(() => setLogoLoading(false));
    return () => { isMounted = false; };
  }, []);

  // Refresh badge counts when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      async function fetchCounts() {
        const userId = currentUserId;
        if (!userId) return;
        // Notifications
        try {
          await fetchNotifications();
        } catch { }
        // Messages
        const msgRes = await getUserConversations(userId);
        if (Array.isArray(msgRes)) {
          const unreadMsgs = msgRes.reduce((sum: number, convo: any) => sum + (convo.unread || 0), 0);
          setUnreadMsg(unreadMsgs);
        }
      }
      fetchCounts();
    }, [currentUserId])
  );

  const getNotificationNavRoute = (item: any) => {
    const type = String(item?.type || '');
    if (type === 'follow' || type === 'follow-request' || type === 'follow-approved' || type === 'new-follower') {
      if (item?.senderId) return `/user-profile/${item?.senderId}`;
      return '/(tabs)/home';
    }
    if (type === 'like' || type === 'comment' || type === 'mention' || type === 'tag') {
      if (item?.postId) {
        if (type === 'comment' && item?.commentId) return `/post-detail?id=${item.postId}&commentId=${item.commentId}`;
        return `/post-detail?id=${item.postId}`;
      }
      return '/(tabs)/home';
    }
    if (type === 'message' || type === 'dm') return `/dm?otherUserId=${item?.senderId}`;
    if (type === 'live') {
      if (item?.streamId) return `/watch-live?roomId=${encodeURIComponent(String(item.streamId))}`;
      return '/(tabs)/map';
    }
    if (type === 'story' || type === 'story-mention' || type === 'story-reply') {
      if (item?.storyId) return `/(tabs)/home?storyId=${encodeURIComponent(String(item.storyId))}`;
      return '/(tabs)/home';
    }
    return `/user-profile/${item?.senderId}`;
  };


  return (
    <View style={styles.topMenu}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 150 }}>
        <View style={{ position: 'relative', height: 40, justifyContent: 'center' }}>
          {/* Base Text Logo - Always visible immediately */}
          <Text style={{
            fontSize: 22,
            fontWeight: '900',
            color: '#0A3D62',
            letterSpacing: -0.5
          }}>
            Trave<Text style={{ color: '#667eea' }}>Social</Text>
          </Text>

          {/* Branding Image - Loads on top if available */}
          <ExpoImage
            source={{ uri: logoUrl || 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'transparent'
            }}
            contentFit="contain"
            transition={300}
            cachePolicy="memory-disk"
          />
        </View>
      </View>
      {isProfileScreen ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_passport'); router.push('/passport' as any); }}>
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={async () => { logAnalyticsEvent('open_notifications'); setNotificationsModalVisible(true); try { await notificationService.markAllAsRead(); await fetchNotifications(); } catch { } }}>
            <Feather name="bell" size={20} color="#000" />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute',
                top: isSmallDevice ? -4 : -6,
                right: isSmallDevice ? -4 : -6,
                backgroundColor: '#ff3b30',
                borderRadius: isSmallDevice ? 7 : 8,
                minWidth: unreadCount > 99 ? (isSmallDevice ? 16 : 18) : (isSmallDevice ? 14 : 16),
                height: unreadCount > 99 ? (isSmallDevice ? 14 : 16) : (isSmallDevice ? 12 : 14),
                paddingHorizontal: unreadCount > 99 ? 1 : (isSmallDevice ? 2 : 3),
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                borderWidth: 1,
                borderColor: '#fff',
              }}>
                <Text style={{
                   color: '#fff',
                   fontWeight: 'bold',
                   fontSize: unreadCount > 99 ? (isSmallDevice ? 6 : 7) : unreadCount > 9 ? (isSmallDevice ? 7 : 8) : (isSmallDevice ? 9 : 10),
                   lineHeight: unreadCount > 99 ? (isSmallDevice ? 9 : 10) : (isSmallDevice ? 11 : 12)
                }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBtn, { zIndex: 101 }]} onPress={() => { logAnalyticsEvent('open_menu'); setMenuVisible(true); }}>
            <Feather name="more-vertical" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_passport'); router.push('/passport' as any); }}>
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_inbox'); router.push('/inbox' as any); }}>
            <Feather name="message-square" size={20} color="#000" />
            {unreadMsg > 0 && (
              <View style={{
                position: 'absolute',
                top: -4,
                right: -4,
                backgroundColor: '#0A3D62',
                borderRadius: 10,
                minWidth: 16,
                paddingHorizontal: 4,
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 10 }}>{unreadMsg}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={async () => { logAnalyticsEvent('open_notifications'); setNotificationsModalVisible(true); try { await notificationService.markAllAsRead(); await fetchNotifications(); } catch { } }}>
            <Feather name="bell" size={20} color="#000" />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -4,
                right: -4,
                backgroundColor: '#ff3b30',
                borderRadius: 10,
                minWidth: 16,
                paddingHorizontal: unreadCount > 99 ? 2 : 4,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100
              }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: unreadCount > 99 ? 8 : 10 }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Three-dot → Groups Drawer */}
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => { logAnalyticsEvent('open_groups_drawer'); setGroupsDrawerVisible(true); }}
          >
            <Feather name="more-vertical" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={async () => {
          setNotificationsModalVisible(false);
          try { await fetchNotifications(); } catch { }
        }}
      />


      {/* Mini stream overlay removed as per request */}
    </View>
  );
}

const styles = StyleSheet.create({
  topMenu: {
    height: isSmallDevice ? 50 : 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isSmallDevice ? 12 : 14,
  },
  logo: {
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '700'
  },
  logoImg: {
    height: isSmallDevice ? 40 : 54,
    width: isSmallDevice ? 130 : 170,
    marginVertical: 2,
    marginLeft: 2,
    marginRight: 2,
  },
  topBtn: {
    padding: isSmallDevice ? 2 : 4,
    position: 'relative',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 999,
  },
  igSheet: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: isSmallDevice ? 18 : 24,
    borderTopRightRadius: isSmallDevice ? 18 : 24,
    paddingTop: isSmallDevice ? 40 : 48,
    paddingBottom: isSmallDevice ? 24 : 32,
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  igHandle: {
    width: isSmallDevice ? 32 : 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  menuItemsContainer: {
    paddingHorizontal: isSmallDevice ? 12 : 16,
    paddingTop: isSmallDevice ? 8 : 12,
  },
  menuGroup: {
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    marginBottom: isSmallDevice ? 10 : 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  igItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 12 : 14,
    paddingHorizontal: isSmallDevice ? 14 : 16,
    backgroundColor: '#fff',
  },
  iconContainer: {
    width: isSmallDevice ? 32 : (isLargeDevice ? 40 : 36),
    height: isSmallDevice ? 32 : (isLargeDevice ? 40 : 36),
    borderRadius: isSmallDevice ? 16 : (isLargeDevice ? 20 : 18),
    backgroundColor: '#f0f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isSmallDevice ? 10 : 12,
  },
  igText: {
    flex: 1,
    color: '#1f2937',
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 'auto',
  },
  separator: {
    height: 0.5,
    backgroundColor: '#e5e7eb',
    marginLeft: isSmallDevice ? 54 : (isLargeDevice ? 68 : 64),
  },
  igItemLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 12 : 14,
    paddingHorizontal: isSmallDevice ? 14 : 16,
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    marginBottom: isSmallDevice ? 10 : 12,
    shadowColor: '#e74c3c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  igTextLogout: {
    flex: 1,
    color: '#e74c3c',
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    paddingVertical: isSmallDevice ? 14 : 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cancelText: {
    color: '#6b7280',
    fontSize: isSmallDevice ? 15 : (isLargeDevice ? 17 : 16),
    fontWeight: '600',
  },
  notificationsModal: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: isSmallDevice ? 50 : 60,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  notificationsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  notificationsList: {
    paddingVertical: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  notificationType: {
    fontSize: 12,
    color: '#0A3D62',
    fontWeight: '600',
    marginBottom: 2,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0A3D62',
    marginLeft: 8,
  },
  emptyNotifications: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyNotificationsText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  miniOverlay: {
    position: 'absolute',
    bottom: isSmallDevice ? 90 : 100,
    right: isSmallDevice ? 12 : 16,
    width: isSmallDevice ? 160 : 180,
    height: isSmallDevice ? 280 : 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
    zIndex: 1000,
  },
  miniHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  miniBtn: { padding: 4 },
});

// MiniStreamOverlay removed
