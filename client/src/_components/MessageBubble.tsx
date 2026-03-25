import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  text?: string;
  imageUrl?: string | null;
  createdAt: any;
  editedAt?: any;
  isSelf: boolean;
  formatTime: (ts: any) => string;
  replyTo?: { id: string; text: string; senderId: string } | null;
  username?: string;
  currentUserId?: string;
  compact?: boolean;
  showTail?: boolean;
  sent?: boolean;
  delivered?: boolean;
  read?: boolean;
};

export default function MessageBubble({
  text,
  imageUrl,
  createdAt,
  editedAt,
  isSelf,
  formatTime,
  replyTo,
  username,
  currentUserId,
  compact = false,
  showTail = true,
  sent = false,
  delivered = false,
  read = false,
}: Props) {
  const hasReply = !!(replyTo && replyTo.text);
  const isReplyFromSelf = replyTo?.senderId === currentUserId;

  return (
    <View style={{ maxWidth: '100%' }}>
      {hasReply && (
        <View style={[styles.replyPreview, isSelf ? styles.replyPreviewSelf : styles.replyPreviewOther]}>
          <View style={[styles.replyLine, isSelf ? styles.replyLineSelf : styles.replyLineOther]} />
          <View style={[styles.replyContent, isSelf ? styles.replyContentSelf : styles.replyContentOther]}>
            <Text style={[styles.replyName, isSelf ? styles.replyNameSelf : styles.replyNameOther]}>
              {isReplyFromSelf ? 'You' : username}
            </Text>
            <Text style={[styles.replyText, isSelf ? styles.replyTextSelf : styles.replyTextOther]} numberOfLines={1}>
              {replyTo?.text}
            </Text>
          </View>
        </View>
      )}

      <View style={[
        styles.msgBubble,
        compact ? styles.msgBubbleCompact : null,
        isSelf ? styles.msgBubbleRight : styles.msgBubbleLeft,
        { alignSelf: isSelf ? 'flex-end' : 'flex-start' }
      ]}>
        {showTail && <View style={isSelf ? styles.tailRight : styles.tailLeft} />}
        {imageUrl && (
          <Image source={{ uri: imageUrl }} style={styles.msgImage} />
        )}
        {!!text && (
          <Text style={isSelf ? styles.msgTextSelf : styles.msgText}>{text}</Text>
        )}
        <View style={styles.msgFooter}>
          <View style={[styles.timePill, isSelf ? styles.timePillSelf : styles.timePillOther]}>
            <Text style={isSelf ? styles.msgTimeSelf : styles.msgTime}>{formatTime(createdAt)}</Text>
            {editedAt && (
              <Text style={[isSelf ? styles.msgTimeSelf : styles.msgTime, styles.editedLabel]}> · edited</Text>
            )}
            {isSelf && (
              <View style={styles.statusContainer}>
                {read ? (
                  <Text style={styles.statusIconRead}>✓✓</Text>
                ) : delivered ? (
                  <Text style={styles.statusIconDelivered}>✓✓</Text>
                ) : sent ? (
                  <Text style={styles.statusIconSent}>✓</Text>
                ) : (
                  <Text style={styles.statusIconPending}>⏳</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  msgBubble: {
    position: 'relative',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    maxWidth: '86%',
    minWidth: 60,
    flexShrink: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  msgBubbleCompact: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
    flexShrink: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  msgBubbleLeft: {
    backgroundColor: '#efefef',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderTopLeftRadius: 10,
  },
  msgBubbleRight: {
    backgroundColor: '#3797f0',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderTopRightRadius: 10,
  },
  tailLeft: {
    position: 'absolute',
    left: -6,
    bottom: 8,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderTopColor: 'transparent',
    borderRightColor: '#efefef',
  },
  tailRight: {
    position: 'absolute',
    right: -6,
    bottom: 8,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderLeftColor: '#3797f0',
  },
  msgText: {
    color: '#1f2937',
    fontSize: 15,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  msgTextSelf: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  timePillOther: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  timePillSelf: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  msgTime: {
    color: 'rgba(0,0,0,0.55)',
    fontSize: 11,
  },
  msgTimeSelf: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  msgImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  editedLabel: {
    fontStyle: 'italic',
    fontSize: 10,
  },
  // Reply styles
  replyPreview: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  replyPreviewSelf: {
    alignSelf: 'flex-end',
  },
  replyPreviewOther: {
    alignSelf: 'flex-start',
    marginLeft: 0,
  },
  replyLine: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
  },
  replyLineSelf: {
    backgroundColor: 'rgba(55,151,240,0.35)',
  },
  replyLineOther: {
    backgroundColor: '#3797f0',
  },
  replyContent: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 200,
  },
  replyContentSelf: {
    backgroundColor: 'rgba(55,151,240,0.12)',
  },
  replyContentOther: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyNameSelf: {
    color: 'rgba(255,255,255,0.9)',
  },
  replyNameOther: {
    color: '#3797f0',
  },
  replyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  replyTextSelf: {
    color: 'rgba(255,255,255,0.82)',
  },
  replyTextOther: {
    color: '#6B7280',
  },
  statusContainer: {
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconRead: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '800',
  },
  statusIconDelivered: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '800',
  },
  statusIconSent: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '800',
  },
  statusIconPending: {
    fontSize: 8,
  },
});
