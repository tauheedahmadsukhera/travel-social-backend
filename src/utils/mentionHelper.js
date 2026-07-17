const mongoose = require('mongoose');

/**
 * Scans a body of text for @username mentions, resolves usernames to canonical user IDs,
 * and enqueues "mention" notifications for all mentioned users.
 * 
 * @param {string} text The caption, comment, or text content to scan.
 * @param {string} senderId The canonical ID of the user triggering the mention.
 * @param {string} postId The ID of the post related to the mention.
 * @param {string} commentId Optional. The ID of the comment if it's a comment mention.
 */
async function handleMentionsAndTags(text, senderId, postId, commentId = null) {
  try {
    if (!text || typeof text !== 'string') return;

    // Regular expression to match @username (handles alphanumeric, underscores, and dots)
    const regex = /@([a-zA-Z0-9_\.]+)/g;
    const usernames = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      usernames.push(match[1].toLowerCase());
    }

    if (usernames.length === 0) return;

    const User = mongoose.model('User');
    const { notificationQueue } = require('../../services/queue');

    // Fetch sender details
    const sender = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(senderId) ? new mongoose.Types.ObjectId(senderId) : null },
        { firebaseUid: senderId },
        { uid: senderId }
      ].filter(Boolean)
    }).select('displayName name username').lean();
    const senderName = sender?.displayName || sender?.name || sender?.username || 'Someone';

    // Find all users who match the extracted usernames (case-insensitive lookup helper)
    const usersToNotify = await User.find({
      username: { $in: usernames.map(u => new RegExp('^' + u + '$', 'i')) }
    }).select('_id').lean();

    for (const recipient of usersToNotify) {
      const recipientId = String(recipient._id);
      
      // Do not notify the sender themselves
      if (recipientId === String(senderId)) continue;

      const body = commentId 
        ? `${senderName} mentioned you in a comment: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`
        : `${senderName} mentioned you in a post`;

      console.log(`[Mention] Enqueuing notification for ${recipientId} from ${senderName}`);
      notificationQueue.add('mention', {
        userId: recipientId,
        senderId: String(senderId),
        title: commentId ? 'Mentioned in comment 💬' : 'Mentioned in post 📸',
        body,
        data: { 
          postId: String(postId), 
          commentId: commentId ? String(commentId) : '', 
          type: commentId ? 'COMMENT_MENTION' : 'POST_MENTION', 
          screen: 'home' 
        }
      }).catch(err => {
        console.warn('[Mention] Queue add error:', err.message);
      });
    }
  } catch (err) {
    console.warn('[handleMentionsAndTags] Error:', err.message);
  }
}

module.exports = {
  handleMentionsAndTags
};
