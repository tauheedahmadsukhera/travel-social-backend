/**
 * Real-time DM handlers (Socket.IO).
 * Extracted from index.js so the entry file stays maintainable.
 */
function registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser }) {
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('join', (userId) => {
      if (userId) {
        connectedUsers.set(userId, socket.id);
        socket.userId = userId;
        socket.join(`user_${userId}`);
        console.log(`👤 User ${userId} joined with socket ${socket.id}`);
        socket.emit('connected', { userId, socketId: socket.id });
      }
    });

    socket.on('subscribeToConversation', (conversationId) => {
      if (conversationId) {
        socket.join(conversationId);
        console.log(`📬 Socket ${socket.id} subscribed to conversation: ${conversationId}`);
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
        const { conversationId, senderId, recipientId, text, timestamp } = data;
        console.log('📨 Message received:', { conversationId, senderId, recipientId, text: text?.substring(0, 30) });

        const Conversation = mongoose.model('Conversation');
        const convo = await Conversation.findOne({
          $or: [
            { conversationId: conversationId },
            { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
          ],
        });

        if (convo) {
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

          console.log('✅ Message saved and emitted to rooms:', {
            conversationRoom: actualConversationId,
            recipientRoom: `user_${recipientId}`,
            senderRoom: `user_${senderId}`,
          });
        }
      } catch (error) {
        console.error('❌ Error handling sendMessage:', error);
        socket.emit('messageError', { error: error.message });
      }
    });

    socket.on('markAsRead', async (data) => {
      try {
        const { conversationId, messageId, userId } = data;
        console.log('👁️ Mark as read:', { conversationId, messageId, userId });

        const Conversation = mongoose.model('Conversation');
        const convo = await Conversation.findOne({
          $or: [
            { conversationId: conversationId },
            { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
          ],
        });

        if (convo) {
          const message = convo.messages.find((m) => m.id === messageId);
          if (message && message.recipientId === userId) {
            message.read = true;
            await convo.save();

            const senderSocketId = connectedUsers.get(message.senderId);
            if (senderSocketId) {
              io.to(senderSocketId).emit('messageRead', { messageId, conversationId });
            }

            console.log('✅ Message marked as read');
          }
        }
      } catch (error) {
        console.error('❌ Error marking message as read:', error);
      }
    });

    socket.on('typing', (data) => {
      const { conversationId, userId, recipientId } = data;
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userTyping', { conversationId, userId });
      }
    });

    socket.on('stopTyping', (data) => {
      const { conversationId, userId, recipientId } = data;
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userStoppedTyping', { conversationId, userId });
      }
    });

    socket.on('sendMediaMessage', async (data) => {
      try {
        const {
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
        } = data;
        console.log('📸 Media message received:', { conversationId, senderId, mediaType: mediaType?.substring(0, 5) });

        const Conversation = mongoose.model('Conversation');
        const convo = await Conversation.findOne({
          $or: [
            { conversationId: conversationId },
            { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
          ],
        });

        if (convo) {
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

          console.log('✅ Media message saved:', mediaType);
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
      console.log('🔌 Socket disconnected:', socket.id);
    });
  });

  console.log('✅ Socket.IO event handlers registered');
}

module.exports = { registerMessagingSocket };
