/**
 * Real-time DM handlers (Socket.IO).
 * Security: JWT handshake, sender identity from token, conversation membership checks.
 */
const jwt = require('jsonwebtoken');
const { getJwtSecretOrNull } = require('../middleware/authMiddleware');

function registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser }) {
  const connectedUsers = new Map();
  const lastEventAtBySocket = new Map();

  const now = () => Date.now();
  const clampText = (v, max) => {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    return s.length > max ? s.slice(0, max) : s;
  };

  function allowEvent(socketId, key, minGapMs) {
    const t = now();
    const bucket = lastEventAtBySocket.get(socketId) || {};
    const last = bucket[key] || 0;
    if (t - last < minGapMs) return false;
    bucket[key] = t;
    lastEventAtBySocket.set(socketId, bucket);
    return true;
  }

  const findConversation = async (conversationId) => {
    if (!conversationId) return null;
    const Conversation = mongoose.model('Conversation');
    return Conversation.findOne({
      $or: [
        { conversationId: String(conversationId) },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
      ],
    });
  };

  async function resolveUserIdVariants(userId) {
    const User = mongoose.model('User');
    const out = new Set([String(userId)]);
    const id = String(userId || '').trim();
    if (!id) return [];
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const byId = await User.findById(id).select('_id firebaseUid uid');
        if (byId?._id) out.add(String(byId._id));
        if (byId?.firebaseUid) out.add(String(byId.firebaseUid));
        if (byId?.uid) out.add(String(byId.uid));
      }
      const byAlt = await User.findOne({ $or: [{ firebaseUid: id }, { uid: id }] }).select('_id firebaseUid uid');
      if (byAlt?._id) out.add(String(byAlt._id));
      if (byAlt?.firebaseUid) out.add(String(byAlt.firebaseUid));
      if (byAlt?.uid) out.add(String(byAlt.uid));
    } catch {
      /* ignore */
    }
    return Array.from(out);
  }

  async function isConversationMember(convo, authUserId) {
    if (!convo || !authUserId) return false;
    const variants = await resolveUserIdVariants(authUserId);
    const parts = (convo.participants || []).map(String);
    return variants.some((v) => parts.includes(v));
  }

  async function assertMessagingAllowed(convo, authUserId, recipientId) {
    if (!(await isConversationMember(convo, authUserId))) return false;
    const recipVars = await resolveUserIdVariants(recipientId);
    const parts = (convo.participants || []).map(String);
    return recipVars.some((v) => parts.includes(v));
  }

  const jwtSecret = getJwtSecretOrNull();
  if (jwtSecret) {
    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('Unauthorized'));
        const decoded = jwt.verify(String(token), jwtSecret);
        const uid = String(decoded.userId || '').trim();
        if (!uid) return next(new Error('Unauthorized'));
        socket.data.authUserId = uid;
        socket.data.authEmail = decoded.email;
        return next();
      } catch {
        return next(new Error('Unauthorized'));
      }
    });
    console.log('✅ Socket.IO JWT handshake enabled');
  } else {
    console.warn('⚠️ Socket.IO JWT handshake disabled (JWT_SECRET unset) — not safe for production');
  }

  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('join', (claimedUserId) => {
      const authId = socket.data.authUserId;
      if (jwtSecret) {
        if (!authId) {
          socket.emit('socketAuthError', { code: 'UNAUTHORIZED', message: 'Missing valid session' });
          return;
        }
        if (claimedUserId != null && String(claimedUserId) !== String(authId)) {
          socket.emit('socketAuthError', { code: 'USER_MISMATCH', message: 'Token does not match join user' });
          return;
        }
        connectedUsers.set(authId, socket.id);
        socket.userId = authId;
        socket.join(`user_${authId}`);
        console.log(`👤 User ${authId} joined with socket ${socket.id}`);
        socket.emit('connected', { userId: authId, socketId: socket.id });
        return;
      }
      // Legacy: no JWT secret (local dev only)
      if (claimedUserId) {
        connectedUsers.set(String(claimedUserId), socket.id);
        socket.userId = String(claimedUserId);
        socket.join(`user_${claimedUserId}`);
        socket.emit('connected', { userId: claimedUserId, socketId: socket.id });
      }
    });

    socket.on('subscribeToConversation', async (conversationId) => {
      try {
        if (!conversationId) return;
        const authId = jwtSecret ? socket.data.authUserId : socket.userId;
        if (jwtSecret && !authId) return;

        const convo = await findConversation(conversationId);
        if (!convo || (jwtSecret && !(await isConversationMember(convo, authId)))) {
          socket.emit('socketAuthError', { code: 'FORBIDDEN', message: 'Cannot subscribe to this thread' });
          return;
        }
        const roomId = convo.conversationId || String(conversationId);
        socket.join(roomId);
        socket.join(String(conversationId));
        console.log(`📬 Socket ${socket.id} subscribed to conversation: ${roomId}`);
      } catch (e) {
        console.warn('[socket] subscribeToConversation failed:', e?.message || e);
      }
    });

    socket.on('unsubscribeFromConversation', (conversationId) => {
      if (conversationId) {
        socket.leave(conversationId);
        console.log(`📭 Socket ${socket.id} unsubscribed from conversation: ${conversationId}`);
      }
    });

    socket.on('sendMessage', async (data) => {
      try {
        if (!allowEvent(socket.id, 'sendMessage', 250)) {
          return socket.emit('messageError', { error: 'Too many messages. Slow down.' });
        }
        let { conversationId, senderId, recipientId, text, timestamp } = data || {};
        text = clampText(text, 2000);
        if (!conversationId || !recipientId || !text) {
          return socket.emit('messageError', { error: 'Invalid message payload' });
        }
        const authId = jwtSecret ? socket.data.authUserId : senderId;
        if (jwtSecret && !authId) {
          return socket.emit('messageError', { error: 'Unauthorized' });
        }
        if (jwtSecret) {
          senderId = authId;
        }

        const Conversation = mongoose.model('Conversation');
        const convo = await findConversation(conversationId);

        if (!convo) {
          return socket.emit('messageError', { error: 'Conversation not found' });
        }
        if (jwtSecret && !(await assertMessagingAllowed(convo, authId, recipientId))) {
          return socket.emit('messageError', { error: 'Forbidden' });
        }

        const message = {
          id: new mongoose.Types.ObjectId().toString(),
          senderId,
          recipientId,
          text,
          timestamp: timestamp || new Date(),
          read: false,
          delivered: false,
        };

        convo.messages.push(message);
        convo.lastMessage = text;
        convo.lastMessageAt = new Date();
        await convo.save();

        const actualConversationId = convo.conversationId;

        socket.emit('messageSent', { ...message, conversationId: actualConversationId });
        io.to(actualConversationId).emit('newMessage', { ...message, conversationId: actualConversationId });
        io.to(`user_${recipientId}`).emit('newMessage', { ...message, conversationId: actualConversationId });
        io.to(`user_${senderId}`).emit('newMessage', { ...message, conversationId: actualConversationId });

        const recipientSocketId = connectedUsers.get(recipientId);
        if (recipientSocketId) {
          message.delivered = true;
          await convo.save();
          socket.emit('messageDelivered', { messageId: message.id, conversationId: actualConversationId });
        } else {
          try {
            const User = mongoose.model('User');
            const senderUser = mongoose.Types.ObjectId.isValid(String(senderId))
              ? await User.findOne({ _id: toObjectId(senderId) })
              : null;
            const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
            const preview = typeof text === 'string' ? text.trim().slice(0, 120) : 'Sent you a message';
            sendExpoPushToUser(recipientId, {
              title: `💌 ${senderName}`,
              body: preview || 'Sent you a message',
              data: {
                type: 'message',
                senderId: String(senderId),
                recipientId: String(recipientId),
                conversationId: String(actualConversationId),
              },
            }).catch(() => {});
          } catch (e) {
            console.warn('[push] message push skipped:', e?.message || e);
          }
        }
      } catch (error) {
        console.error('❌ Error handling sendMessage:', error);
        socket.emit('messageError', { error: error.message });
      }
    });

    socket.on('markAsRead', async (data) => {
      try {
        if (!allowEvent(socket.id, 'markAsRead', 150)) return;
        const { conversationId, messageId, userId } = data || {};
        const authId = jwtSecret ? socket.data.authUserId : userId;
        if (jwtSecret && !authId) return;

        const Conversation = mongoose.model('Conversation');
        const convo = await findConversation(conversationId);

        if (convo) {
          if (jwtSecret && !(await isConversationMember(convo, authId))) return;

          const message = convo.messages.find((m) => m.id === messageId);
          if (!message) return;

          if (jwtSecret) {
            const variants = await resolveUserIdVariants(authId);
            if (!variants.includes(String(message.recipientId))) return;
          } else if (message.recipientId !== userId) {
            return;
          }

          message.read = true;
          await convo.save();

          const senderSocketId = connectedUsers.get(message.senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('messageRead', { messageId, conversationId });
          }
        }
      } catch (error) {
        console.error('❌ Error marking message as read:', error);
      }
    });

    socket.on('typing', async (data) => {
      const { conversationId, userId, recipientId } = data || {};
      if (!allowEvent(socket.id, 'typing', 250)) return;
      const authId = jwtSecret ? socket.data.authUserId : userId;
      if (jwtSecret && authId) {
        const variants = await resolveUserIdVariants(authId);
        if (!variants.includes(String(userId))) return;
        const convo = await findConversation(conversationId);
        if (!convo || !(await isConversationMember(convo, authId))) return;
      }
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userTyping', { conversationId, userId });
      }
    });

    socket.on('stopTyping', async (data) => {
      const { conversationId, userId, recipientId } = data || {};
      if (!allowEvent(socket.id, 'stopTyping', 250)) return;
      const authId = jwtSecret ? socket.data.authUserId : userId;
      if (jwtSecret && authId) {
        const variants = await resolveUserIdVariants(authId);
        if (!variants.includes(String(userId))) return;
        const convo = await findConversation(conversationId);
        if (!convo || !(await isConversationMember(convo, authId))) return;
      }
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userStoppedTyping', { conversationId, userId });
      }
    });

    socket.on('sendMediaMessage', async (data) => {
      try {
        if (!allowEvent(socket.id, 'sendMediaMessage', 400)) {
          return socket.emit('messageError', { error: 'Too many messages. Slow down.' });
        }
        let {
          conversationId,
          senderId,
          recipientId,
          mediaUrl,
          mediaType,
          audioUrl,
          audioDuration,
          text,
          thumbnailUrl,
          tempId,
        } = data || {};

        if (!conversationId || !recipientId) {
          return socket.emit('messageError', { error: 'Invalid message payload' });
        }
        text = clampText(text || '', 4000);
        mediaType = clampText(String(mediaType || ''), 20);
        mediaUrl = clampText(String(mediaUrl || ''), 2000);
        audioUrl = clampText(String(audioUrl || ''), 2000);
        thumbnailUrl = clampText(String(thumbnailUrl || ''), 2000);
        if (!mediaType || (!mediaUrl && !audioUrl)) {
          return socket.emit('messageError', { error: 'Invalid media payload' });
        }
        const authId = jwtSecret ? socket.data.authUserId : senderId;
        if (jwtSecret && !authId) {
          return socket.emit('messageError', { error: 'Unauthorized' });
        }
        if (jwtSecret) {
          senderId = authId;
        }

        const Conversation = mongoose.model('Conversation');
        const convo = await findConversation(conversationId);

        if (!convo) {
          return socket.emit('messageError', { error: 'Conversation not found' });
        }
        if (jwtSecret && !(await assertMessagingAllowed(convo, authId, recipientId))) {
          return socket.emit('messageError', { error: 'Forbidden' });
        }

        const message = {
          id: new mongoose.Types.ObjectId().toString(),
          senderId,
          recipientId,
          text: text || '',
          mediaType,
          mediaUrl,
          audioUrl,
          audioDuration,
          thumbnailUrl,
          timestamp: new Date(),
          read: false,
          delivered: false,
          readBy: [senderId],
          tempId,
        };

        convo.messages.push(message);
        convo.lastMessage = `[${mediaType?.toUpperCase()}]`;
        convo.lastMessageAt = new Date();
        await convo.save();

        const actualConversationId = convo.conversationId;

        io.to(actualConversationId).emit('newMediaMessage', { ...message, conversationId: actualConversationId });

        if (recipientId) {
          io.to(`user_${recipientId}`).emit('newMediaMessage', { ...message, conversationId: actualConversationId });
        }

        io.to(`user_${senderId}`).emit('newMediaMessage', { ...message, conversationId: actualConversationId });

        try {
          const recipientSocketId = connectedUsers.get(recipientId);
          if (!recipientSocketId) {
            const User = mongoose.model('User');
            const senderUser = mongoose.Types.ObjectId.isValid(String(senderId))
              ? await User.findOne({ _id: toObjectId(senderId) })
              : null;
            const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
            const kind = String(mediaType || '').toLowerCase();
            const body =
              kind === 'audio'
                ? 'Sent you a voice message'
                : kind === 'video'
                  ? 'Sent you a video'
                  : 'Sent you a photo';

            sendExpoPushToUser(recipientId, {
              title: `💌 ${senderName}`,
              body,
              data: {
                type: 'message',
                senderId: String(senderId),
                recipientId: String(recipientId),
                conversationId: String(actualConversationId),
              },
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('[push] media message push skipped:', e?.message || e);
        }
      } catch (error) {
        console.error('❌ Error handling sendMediaMessage:', error);
        socket.emit('messageError', { error: error.message });
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        console.log(`👋 User ${socket.userId} disconnected`);
      }
      lastEventAtBySocket.delete(socket.id);
      console.log('🔌 Socket disconnected:', socket.id);
    });
  });

  console.log('✅ Socket.IO event handlers registered');
}

module.exports = { registerMessagingSocket };
