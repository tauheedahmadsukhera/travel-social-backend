export function getNotificationActionText(item: any): string {
  const type = String(item?.type || '');
  if (type === 'message' || type === 'dm') return 'sent you a message';
  if (type === 'like') return 'liked your post';
  if (type === 'comment') return 'commented on your post';
  if (type === 'follow') return 'started following you';
  if (type === 'follow-request') return 'sent you a follow request';
  if (type === 'follow-approved') return 'approved your follow request';
  if (type === 'new-follower') return 'started following you';
  if (type === 'mention') return 'mentioned you in a post';
  if (type === 'tag') return 'tagged you in a post';
  if (type === 'live') return 'started a live stream';
  if (type === 'story' || type === 'story-mention' || type === 'story-reply') return 'updated your story';

  const msg = typeof item?.message === 'string' ? item.message.trim() : '';
  if (msg) return msg;

  return 'sent you a notification';
}

export function getNotificationDisplayText(item: any): string {
  const senderNameRaw = item?.senderName;
  const senderName = typeof senderNameRaw === 'string' && senderNameRaw.trim() ? senderNameRaw.trim() : 'Someone';
  return `${senderName} ${getNotificationActionText(item)}`;
}
