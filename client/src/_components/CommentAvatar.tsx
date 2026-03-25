import React from 'react';
import { useRouter } from 'expo-router';
import { Image, TouchableOpacity } from 'react-native';
import { useUserProfile } from '../_hooks/useUserProfile';

export default function CommentAvatar({ userId, userAvatar, size = 36 }: { userId: string, userAvatar?: string, size?: number }) {
  const router = useRouter();
  const { profile } = useUserProfile(userId);
  const avatar = profile?.avatar;
  const avatarUri = (typeof avatar === 'string' && avatar.trim())
    ? avatar
    : (typeof userAvatar === 'string' && userAvatar.trim())
      ? userAvatar
      : 'https://via.placeholder.com/200x200.png?text=Profile';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={!userId}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => {
        if (!userId) return;
        router.push({ pathname: '/user-profile', params: { id: userId } } as any);
      }}
    >
      <Image
        source={{ uri: avatarUri }}
        style={{ width: size, height: size, borderRadius: size / 2, marginRight: 12 }}
      />
    </TouchableOpacity>
  );
}
