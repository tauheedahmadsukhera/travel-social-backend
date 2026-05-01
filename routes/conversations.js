const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const { verifyToken } = require('../src/middleware/authMiddleware');


// Get the Conversation model (already defined in models/Conversation.js and required in index.js)


const findConversationByAnyId = async (id) => {
  if (!id) return null;
  return Conversation.findOne({
    $or: [
      { conversationId: String(id) },
      { _id: mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null }
    ]
  });
};

const isStrictLegacyPairConversationId = (value) => {
  const id = String(value || '');
  if (!id || id.startsWith('grp_')) return false;
  const parts = id.split('_');
  if (parts.length !== 2) return false;
  const [a, b] = parts;
  // Only treat as pair key for legacy Mongo-style IDs to avoid underscore ID collisions.
  return mongoose.Types.ObjectId.isValid(a) && mongoose.Types.ObjectId.isValid(b);
};

const normalizeParticipantIds = async (ids) => {
  const User = mongoose.model('User');
  const out = new Set();
  const rawIds = (Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean);
  
  const objectIds = rawIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  const otherIds = rawIds.filter(id => !mongoose.Types.ObjectId.isValid(id));

  // Add valid ObjectIds directly
  objectIds.forEach(id => out.add(id));

  if (otherIds.length > 0) {
    const users = await User.find({
      $or: [{ firebaseUid: { $in: otherIds } }, { uid: { $in: otherIds } }]
    }).select('_id firebaseUid uid').lean();
    
    users.forEach(u => out.add(String(u._id)));
    // Keep track of IDs that weren't found as canonical IDs
    const foundAltIds = new Set([...users.map(u => String(u.firebaseUid)), ...users.map(u => String(u.uid))]);
    otherIds.forEach(id => { if (!foundAltIds.has(id)) out.add(id); });
  }

  return Array.from(out);
};

const resolveUserIdVariants = async (id) => {
  const User = mongoose.model('User');
  const out = new Set([String(id)]);
  try {
    const query = mongoose.Types.ObjectId.isValid(id) 
      ? { $or: [{ _id: id }, { firebaseUid: id }, { uid: id }] }
      : { $or: [{ firebaseUid: id }, { uid: id }] };
      
    const user = await User.findOne(query).select('_id firebaseUid uid').lean();
    if (user) {
      if (user._id) out.add(String(user._id));
      if (user.firebaseUid) out.add(String(user.firebaseUid));
      if (user.uid) out.add(String(user.uid));
    }
  } catch {}
  return Array.from(out);
};

const findThreadConversations = async (conversation) => {
  const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
  if (participants.length !== 2) return [conversation];

  const aIds = await resolveUserIdVariants(participants[0]);
  const bIds = await resolveUserIdVariants(participants[1]);

  return Conversation.find({
    $and: [
      { participants: { $in: aIds } },
      { participants: { $in: bIds } },
      { $expr: { $eq: [{ $size: '$participants' }, 2] } }
    ]
  });
};

// Get conversations for user with populated participant data
router.get('/', verifyToken, async (req, res) => {
  try {
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const userId = userIdFromToken;

    console.log('[GET] /conversations - Fetching for userId:', userId);

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatchSet = new Set([String(userId)]);
    if (firebaseUidFromToken) idsToMatchSet.add(String(firebaseUidFromToken));

    try {
      const resolved = await resolveUserIdVariants(String(userId));
      for (const rid of (resolved || [])) {
        if (rid) idsToMatchSet.add(String(rid));
      }
    } catch (e) {
      console.warn('[GET] /conversations - resolveUserIdVariants failed:', e?.message || e);
    }

    const idsToMatch = Array.from(idsToMatchSet);

    const conversations = await Conversation.find({
      participants: { $in: idsToMatch },
      deletedBy: { $nin: idsToMatch }
    }).sort({ lastMessageAt: -1 });
    
    console.log('[GET] /conversations - Found', conversations.length, 'conversations for user:', userId);
    conversations.forEach((c, i) => {
      console.log(`  [${i}] conversationId: ${c.conversationId}, participants: ${c.participants}, messages: ${c.messages?.length || 0}`);
    });

    // Populate participant data
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const convoIds = conversations.map(c => String(c.conversationId || c._id));
    const allUnreadCandidates = await Message.find({
      conversationId: { $in: convoIds },
      senderId: { $nin: idsToMatch }
    }).select('conversationId senderId recipientId read readBy timestamp createdAt').lean().catch(() => []);
    
    const unreadMap = {};
    allUnreadCandidates.forEach(m => {
      const cid = String(m.conversationId);
      if (!unreadMap[cid]) unreadMap[cid] = [];
      unreadMap[cid].push(m);
    });

    const enrichedConversations = await Promise.all(conversations.map(async (conversation) => {
      const convObj = conversation.toObject ? conversation.toObject() : conversation;

      const archivedBy = Array.isArray(convObj?.archivedBy) ? convObj.archivedBy.map(String) : [];
      const isArchived = archivedBy.some((id) => idsToMatch.includes(String(id)));

      const participants = Array.isArray(convObj?.participants) ? convObj.participants.map(String) : [];
      const isGroup = !!convObj?.isGroup;

      // Calculate lastCleared for this user across all idsToMatch
      let lastCleared = 0;
      const clearedMap = convObj?.clearedBy || {};
      for (const uid of idsToMatch) {
        const timeVal = clearedMap instanceof Map ? clearedMap.get(uid) : clearedMap[uid];
        if (timeVal) {
          const t = new Date(timeVal).getTime();
          if (t > lastCleared) lastCleared = t;
        }
      }

      const conversationIdStr = String(convObj.conversationId || convObj._id);
      const candidates = unreadMap[conversationIdStr] || [];

      const visibleMsgs = candidates.filter(m => {
        const mTime = new Date(m.timestamp || m.createdAt || 0).getTime();
        return mTime > lastCleared;
      });

      const unreadCount = visibleMsgs.reduce((acc, m) => {
        if (isGroup) {
          const readBy = Array.isArray(m?.readBy) ? m.readBy.map(String) : [];
          const readByMe = idsToMatch.some((id) => readBy.includes(String(id)));
          return readByMe ? acc : acc + 1;
        }

        const recipientId = String(m?.recipientId || '');
        const isForMe = recipientId && idsToMatch.includes(recipientId);
        const isRead = m?.read === true;
        return (!isRead && isForMe) ? acc + 1 : acc;
      }, 0);

      // Update lastMessage preview if cleared
      if (lastCleared > 0) {
        const lastMsgTime = new Date(convObj.lastMessageAt || 0).getTime();
        if (lastMsgTime <= lastCleared) {
          convObj.lastMessage = '';
          // We keep lastMessageAt for sorting, but clear the text preview
        }
      }

      if (isGroup) {
        return {
          ...convObj,
          [`archived_${String(userId)}`]: isArchived,
          isArchived,
          unreadCount,
          group: {
            id: String(convObj?._id || convObj?.conversationId || ''),
            name: convObj?.groupName || 'Group Chat',
            avatar: convObj?.groupAvatar || null,
            memberCount: participants.length,
            adminIds: Array.isArray(convObj?.groupAdminIds) ? convObj.groupAdminIds.map(String) : [],
          }
        };
      }

      const otherParticipantId = participants.find(p => !idsToMatch.includes(String(p)));
      if (!otherParticipantId) {
        return {
          ...convObj,
          [`archived_${String(userId)}`]: isArchived,
          isArchived,
          unreadCount,
        };
      }

      const otherUser = await usersCollection.findOne({
        $or: [
          { firebaseUid: otherParticipantId },
          { uid: otherParticipantId },
          { _id: mongoose.Types.ObjectId.isValid(otherParticipantId) ? new mongoose.Types.ObjectId(otherParticipantId) : null }
        ]
      });

      return {
        ...convObj,
        [`archived_${String(userId)}`]: isArchived,
        isArchived,
        unreadCount,
        otherParticipant: {
          id: otherParticipantId,
          name: otherUser?.displayName || otherUser?.name || 'User',
          avatar: otherUser?.avatar || otherUser?.photoURL || null
        }
      };
    }));

    console.log('[GET] /conversations - Returning', enrichedConversations.length, 'enriched conversations');
    res.json({ success: true, data: enrichedConversations || [] });
  } catch (err) {
    console.error('[GET /conversations] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolve or create a canonical direct conversation for authenticated user and target user.
router.post('/resolve', verifyToken, async (req, res) => {
  try {
    const actorIdRaw = String(req.userId || '');
    const targetIdRaw = String(req.body?.otherUserId || req.body?.targetUserId || '').trim();

    if (!actorIdRaw || !targetIdRaw) {
      return res.status(400).json({ success: false, error: 'otherUserId required' });
    }

    const User = mongoose.model('User');

    let actorId = actorIdRaw;
    if (!mongoose.Types.ObjectId.isValid(actorId)) {
      const actor = await User.findOne({ $or: [{ firebaseUid: actorId }, { uid: actorId }] }).select('_id');
      if (actor?._id) actorId = String(actor._id);
    }

    let targetId = targetIdRaw;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      const target = await User.findOne({ $or: [{ firebaseUid: targetId }, { uid: targetId }] }).select('_id');
      if (target?._id) targetId = String(target._id);
    }

    const actorVariants = await resolveUserIdVariants(actorId);
    const targetVariants = await resolveUserIdVariants(targetId);

    let conversation = await Conversation.findOne({
      $and: [
        { isGroup: { $ne: true } },
        { participants: { $in: actorVariants } },
        { participants: { $in: targetVariants } },
        { $expr: { $eq: [{ $size: '$participants' }, 2] } }
      ]
    }).sort({ updatedAt: -1, lastMessageAt: -1 });

    if (!conversation) {
      const participants = [String(actorId), String(targetId)].sort();
      conversation = new Conversation({
        conversationId: `${participants[0]}_${participants[1]}`,
        participants,
        isGroup: false,
        messages: [],
        lastMessage: '',
        lastMessageAt: new Date(),
      });
      await conversation.save();
    }

    return res.json({
      success: true,
      conversationId: String(conversation.conversationId || conversation._id),
      data: conversation,
    });
  } catch (err) {
    console.error('[POST] /conversations/resolve - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get conversation details by conversationId or _id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const convo = conversation.toObject ? conversation.toObject() : conversation;
    return res.json({
      success: true,
      data: {
        ...convo,
        memberCount: participants.length,
      }
    });
  } catch (err) {
    console.error('[GET] /conversations/:id - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create group conversation
router.post('/group', verifyToken, async (req, res) => {
  try {
    const creatorId = String(req.userId || '');
    if (!creatorId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, avatar, description, memberIds } = req.body || {};
    const groupName = String(name || '').trim();
    if (!groupName) {
      return res.status(400).json({ success: false, error: 'Group name required' });
    }

    const normalized = await normalizeParticipantIds([creatorId, ...(Array.isArray(memberIds) ? memberIds : [])]);
    if (normalized.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 participants required' });
    }

    const baseId = new mongoose.Types.ObjectId();
    const conversationId = `grp_${String(baseId)}`;
    const conversation = new Conversation({
      _id: baseId,
      conversationId,
      participants: normalized,
      isGroup: true,
      groupName,
      groupAvatar: typeof avatar === 'string' ? avatar.trim() : '',
      groupDescription: typeof description === 'string' ? description.trim() : '',
      groupAdminIds: [creatorId],
      messages: [],
      lastMessage: '',
      lastMessageAt: new Date(),
    });

    await conversation.save();
    return res.json({ success: true, data: conversation, conversationId });
  } catch (err) {
    console.error('[POST] /conversations/group - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update group members (admin only)
router.patch('/:id/group-members', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const actorId = String(req.userId || '');
    const { addMemberIds = [], removeMemberIds = [] } = req.body || {};

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ success: false, error: 'Not a group conversation' });
    }

    const adminIds = Array.isArray(conversation.groupAdminIds) ? conversation.groupAdminIds.map(String) : [];
    if (!adminIds.includes(actorId)) {
      return res.status(403).json({ success: false, error: 'Only group admins can manage members' });
    }

    const addIds = await normalizeParticipantIds(addMemberIds);
    const removeIds = Array.isArray(removeMemberIds) ? removeMemberIds.map((x) => String(x)) : [];

    const next = new Set((conversation.participants || []).map(String));
    addIds.forEach((x) => next.add(String(x)));
    removeIds.forEach((x) => {
      if (!adminIds.includes(String(x))) next.delete(String(x));
    });

    if (next.size < 2) {
      return res.status(400).json({ success: false, error: 'Group must keep at least 2 participants' });
    }

    conversation.participants = Array.from(next);
    conversation.updatedAt = new Date();
    await conversation.save();

    return res.json({ success: true, data: conversation });
  } catch (err) {
    console.error('[PATCH] /conversations/:id/group-members - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Archive conversation for authenticated user (soft archive)
router.post('/:id/archive', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      {
        $addToSet: { archivedBy: { $each: idsToMatch } },
        $pull: { deletedBy: { $in: idsToMatch } }
      }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST] /conversations/:id/archive - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Unarchive conversation for authenticated user
router.post('/:id/unarchive', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      { $pull: { archivedBy: { $in: idsToMatch } } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST] /conversations/:id/unarchive - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete conversation for authenticated user (soft delete / hide from inbox)
router.post('/:id/delete', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      {
        $addToSet: { deletedBy: { $each: idsToMatch } },
        $pull: { archivedBy: { $in: idsToMatch } }
      }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST] /conversations/:id/delete - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Clear messages for authenticated user (soft clear history)
router.post('/:id/clear', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = String(req.userId || '');
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversation = await findConversationByAnyId(id);
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

    // Use current time as the clear timestamp
    const now = new Date();
    
    // Support all variants of the user's ID
    const variants = await resolveUserIdVariants(userId);
    const convoIds = (await findThreadConversations(conversation)).map(c => c._id);

    // Update all matching duplicate conversations (legacy support)
    const update = { $set: {} };
    for (const vid of variants) {
      update.$set[`clearedBy.${vid}`] = now;
    }
    
    await Conversation.updateMany({ _id: { $in: convoIds } }, update);

    return res.json({ success: true, clearedAt: now });
  } catch (err) {
    console.error('[POST] /conversations/:id/clear - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get messages for a conversation
router.get('/:id/messages', verifyToken, async (req, res) => {
  try {
    const conversationId = req.params.id;

    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const User = mongoose.model('User');
    const resolveUserIdVariants = async (id) => {
      const out = new Set([String(id)]);
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
      } catch {}
      return Array.from(out);
    };

    let convos = [];

    // Only use pair parsing for strict legacy ObjectId_ObjectId keys.
    if (isStrictLegacyPairConversationId(conversationId)) {
      const parts = conversationId.split('_');
      const a = parts[0];
      const b = parts[1];
      const aIds = await resolveUserIdVariants(a);
      const bIds = await resolveUserIdVariants(b);
      convos = await Conversation.find({
        $and: [
          { isGroup: { $ne: true } },
          { participants: { $in: aIds } },
          { participants: { $in: bIds } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ lastMessageAt: -1 });
    } else {
      // Try to find by string ID first, then by MongoDB ObjectId
      const single = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });
      if (single) convos = [single];
    }

    if (!convos || convos.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Privacy: only participants can read (for all merged convos)
    const allowed = convos.some(c => {
      const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
      return idsToMatch.some(id => participants.includes(String(id)));
    });

    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Merge messages across duplicate conversations
    const merged = [];
    const seen = new Set();
    for (const c of convos) {
      const msgs = await Message.find({ conversationId: String(c.conversationId || c._id) }).lean();
      for (const m of msgs) {
        const mid = m?._id || m?.id;
        if (mid) {
          if (seen.has(String(mid))) continue;
          seen.add(String(mid));
        }
        merged.push(m);
      }
    }

    merged.sort((m1, m2) => {
      const t1 = new Date(m1?.timestamp || 0).getTime() || 0;
      const t2 = new Date(m2?.timestamp || 0).getTime() || 0;
      return t1 - t2;
    });

    // Filter by clearedBy timestamp for current user
    const finalMessages = merged.filter(m => {
      const mTime = new Date(m.timestamp || m.createdAt || 0).getTime();
      let lastCleared = 0;
      
      // Check each convo for a cleared timestamp for this user
      for (const c of convos) {
        const clearedMap = c.clearedBy;
        if (clearedMap) {
          for (const uid of idsToMatch) {
            const timeVal = clearedMap instanceof Map ? clearedMap.get(uid) : clearedMap[uid];
            if (timeVal) {
              const t = new Date(timeVal).getTime();
              if (t > lastCleared) lastCleared = t;
            }
          }
        }
      }
      return mTime > lastCleared;
    });

    // Pagination
    const limit = parseInt(req.query.limit) || 0;
    const skip = parseInt(req.query.skip) || 0;
    
    let result = finalMessages;
    if (limit > 0) {
      // If limit is provided, we typically want the LATEST N messages
      // but in the order the frontend expects (chronological).
      // So we take the slice from the end.
      const total = finalMessages.length;
      const start = Math.max(0, total - skip - limit);
      const end = Math.max(0, total - skip);
      result = finalMessages.slice(start, end);
    }

    res.json({ 
      success: true, 
      messages: result,
      pagination: {
        total: finalMessages.length,
        limit: limit,
        skip: skip,
        hasMore: skip + limit < finalMessages.length
      }
    });
  } catch (err) {
    console.error('[GET] /:id/messages - Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark all messages as read for the authenticated user in a conversation
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const conversationId = req.params.id;

    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const User = mongoose.model('User');
    const resolveUserIdVariants = async (id) => {
      const out = new Set([String(id)]);
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
      } catch {}
      return Array.from(out);
    };

    let convos = [];

    if (isStrictLegacyPairConversationId(conversationId)) {
      const parts = conversationId.split('_');
      const a = parts[0];
      const b = parts[1];
      const aIds = await resolveUserIdVariants(a);
      const bIds = await resolveUserIdVariants(b);
      convos = await Conversation.find({
        $and: [
          { isGroup: { $ne: true } },
          { participants: { $in: aIds } },
          { participants: { $in: bIds } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ lastMessageAt: -1 });
    } else {
      const single = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });

      // If we found a conversation, expand to all legacy duplicates for this participant pair
      if (single && Array.isArray(single?.participants) && single.participants.length === 2) {
        const p0 = String(single.participants[0]);
        const p1 = String(single.participants[1]);
        const p0Ids = await resolveUserIdVariants(p0);
        const p1Ids = await resolveUserIdVariants(p1);
        convos = await Conversation.find({
          $and: [
            { participants: { $in: p0Ids } },
            { participants: { $in: p1Ids } }
          ]
        }).sort({ lastMessageAt: -1 });
      } else if (single) {
        convos = [single];
      }
    }

    if (!convos || convos.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const allowed = convos.some(c => {
      const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
      return idsToMatch.some(id => participants.includes(String(id)));
    });

    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const isGroup = convos.some((c) => !!c?.isGroup);
    let markedCount = 0;
    for (const c of convos) {
      let changed = false;
      const msgs = await Message.find({ conversationId: String(c.conversationId || c._id) });
      
      for (const m of msgs) {
        if (isGroup || c?.isGroup) {
          const senderId = String(m?.senderId || '');
          const isFromSelf = idsToMatch.includes(senderId);
          if (isFromSelf) continue;

          if (!Array.isArray(m.readBy)) m.readBy = [];
          const alreadyRead = idsToMatch.some((id) => m.readBy.includes(String(id)));
          if (!alreadyRead) {
            m.readBy.push(String(userIdFromToken));
            markedCount += 1;
            changed = true;
            await m.save();
          }
          continue;
        }

        const recipientId = m?.recipientId != null ? String(m.recipientId) : '';
        const isForMe = recipientId && idsToMatch.some(id => String(id) === recipientId);
        if (isForMe && m?.read === false) {
          m.read = true;
          markedCount += 1;
          changed = true;
          await m.save();
        }
      }
      if (changed) {
        c.updatedAt = new Date();
        await c.save();
      }
    }

    return res.json({ success: true, markedCount });
  } catch (err) {
    console.error('[PATCH] /:id/read - Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Send a message in a conversation (POST /:id/messages)
router.post('/:id/messages', verifyToken, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { senderId, sender, text, recipientId, replyTo, read } = req.body;
    
    // Sender must be the authenticated user
    const actualSenderId = String(req.userId || senderId || sender || '');
    if (!actualSenderId || !text) {
      return res.status(400).json({ success: false, error: 'Missing senderId and/or text' });
    }

    // Normalize recipientId to Mongo _id string where possible
    const User = mongoose.model('User');
    let normalizedRecipientId = recipientId ? String(recipientId) : null;
    if (normalizedRecipientId && !mongoose.Types.ObjectId.isValid(normalizedRecipientId)) {
      const found = await User.findOne({ $or: [{ firebaseUid: normalizedRecipientId }, { uid: normalizedRecipientId }] }).select('_id');
      if (found?._id) {
        normalizedRecipientId = String(found._id);
      }
    }

    // Also normalize sender if somehow a firebase uid was passed
    let normalizedSenderId = String(actualSenderId);
    if (!mongoose.Types.ObjectId.isValid(normalizedSenderId)) {
      const foundSender = await User.findOne({ $or: [{ firebaseUid: normalizedSenderId }, { uid: normalizedSenderId }] }).select('_id');
      if (foundSender?._id) {
        normalizedSenderId = String(foundSender._id);
      }
    }

    // Try to find by string ID first, then by MongoDB ObjectId, then by direct-message participant pair
    let convo = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
        // Only match non-group 1:1 chats when using participant fallback.
        normalizedRecipientId
          ? {
              $and: [
                { isGroup: { $ne: true } },
                { participants: { $all: [normalizedSenderId, normalizedRecipientId] } },
                { $expr: { $eq: [{ $size: '$participants' }, 2] } }
              ]
            }
          : null
      ].filter(Boolean)
    });

    if (!convo) {
      console.log('[POST] /:id/messages - Conversation not found, creating new one:', conversationId);
      // Conversation doesn't exist yet, create it
      // Use actual IDs from request body to avoid parsing issues with underscores in user IDs
      const participants = [normalizedSenderId, normalizedRecipientId];

      if (participants.length < 2) {
        console.error('[POST] ERROR: Cannot create conversation without 2 participants! Got:', participants);
        return res.status(400).json({ success: false, error: 'Requires both senderId and recipientId' });
      }

      // Sort participants to ensure consistent conversationId
      const sortedParticipants = participants.sort();
      const standardConversationId = `${sortedParticipants[0]}_${sortedParticipants[1]}`;

      console.log('[POST] Creating conversation with participants:', sortedParticipants, 'conversationId:', standardConversationId);

      convo = new Conversation({
        conversationId: standardConversationId,
        participants: sortedParticipants
      });
    }

    const isGroupConversation = !!convo?.isGroup;

    // If sender had previously hidden/archived this conversation, revive it on new outgoing message.
    const senderVariants = await resolveUserIdVariants(String(normalizedSenderId));
    const senderSet = new Set([String(normalizedSenderId), ...senderVariants.map(String)]);
    convo.deletedBy = (Array.isArray(convo.deletedBy) ? convo.deletedBy : []).filter((id) => !senderSet.has(String(id)));
    convo.archivedBy = (Array.isArray(convo.archivedBy) ? convo.archivedBy : []).filter((id) => !senderSet.has(String(id)));

    // Also revive for recipient so new incoming messages reappear in inbox.
    if (normalizedRecipientId) {
      const recipientVariants = await resolveUserIdVariants(String(normalizedRecipientId));
      const recipientSet = new Set([String(normalizedRecipientId), ...recipientVariants.map(String)]);
      convo.deletedBy = (Array.isArray(convo.deletedBy) ? convo.deletedBy : []).filter((id) => !recipientSet.has(String(id)));
      convo.archivedBy = (Array.isArray(convo.archivedBy) ? convo.archivedBy : []).filter((id) => !recipientSet.has(String(id)));
    }

    if (!isGroupConversation && !normalizedRecipientId) {
      return res.status(400).json({ success: false, error: 'Requires recipientId' });
    }
    
    // Create the message in the standalone Message collection
    const storyPointerMatch = String(text || '').match(/story:\/\/([A-Za-z0-9_-]+)/i);
    const storyIdFromText = storyPointerMatch?.[1] || null;

    const { 
      mediaType, 
      mediaUrl, 
      audioUrl, 
      audioDuration, 
      videoUrl, 
      thumbnailUrl, 
      sharedPost, 
      sharedStory,
      tempId 
    } = req.body;

    const messageData = { 
      conversationId: String(convo.conversationId || convo._id),
      senderId: normalizedSenderId, 
      text,
      mediaType: mediaType || (storyIdFromText ? 'story' : 'text'),
      mediaUrl,
      audioUrl,
      audioDuration,
      videoUrl,
      thumbnailUrl,
      sharedPost,
      sharedStory,
      tempId, // Echo back to client for perfect deduplication
      read: read || false,
      readBy: [normalizedSenderId],
      timestamp: new Date(),
      createdAt: new Date()
    };

    if (storyIdFromText) {
      messageData.mediaType = 'story';
      messageData.sharedStory = {
        storyId: storyIdFromText,
        id: storyIdFromText,
        userId: normalizedSenderId,
      };
    }
    
    // Add recipientId if provided
    if (normalizedRecipientId) {
      messageData.recipientId = normalizedRecipientId;
    }
    
    // Add replyTo if replying to a message
    if (replyTo) {
      messageData.replyTo = replyTo;
    }
    
    // Add an ID to the message for easier deletion/editing
    messageData.id = new mongoose.Types.ObjectId().toString();

    const newMessage = new Message(messageData);
    await newMessage.save();
    const message = newMessage.toObject(); // for sending back in response
    
    // Atomic update using findOneAndUpdate to prevent lost updates during high concurrency
    const updatedConvo = await Conversation.findOneAndUpdate(
      { _id: convo._id },
      {
        $set: {
          lastMessage: storyIdFromText ? '[STORY]' : text,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
          deletedBy: convo.deletedBy || [],
          archivedBy: convo.archivedBy || []
        }
      },
      { new: true }
    );
    
    if (!updatedConvo) {
       await convo.save();
    }

    // Best-effort: create notification for recipient
    try {
      if (!isGroupConversation && normalizedRecipientId && normalizedRecipientId !== normalizedSenderId) {
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        const senderUser = mongoose.Types.ObjectId.isValid(normalizedSenderId)
          ? await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(normalizedSenderId) })
          : null;
        const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
        const senderAvatar = senderUser?.avatar || senderUser?.photoURL || null;

        const notificationsCollection = db.collection('notifications');
        const convId = String(convo.conversationId || conversationId);
        const now = new Date();

        // Dedupe: keep only one unread message notification per (recipient, sender, conversation)
        // If an unread one exists, update its timestamp + sender meta. Otherwise, insert a new one.
        await notificationsCollection.updateOne(
          {
            recipientId: String(normalizedRecipientId),
            senderId: String(normalizedSenderId),
            type: 'message',
            conversationId: convId,
            read: { $ne: true }
          },
          {
            $set: {
              senderName,
              senderAvatar,
              message: 'messaged you',
              createdAt: now
            },
            $setOnInsert: {
              recipientId: String(normalizedRecipientId),
              senderId: String(normalizedSenderId),
              type: 'message',
              conversationId: convId,
              read: false
            }
          },
          { upsert: true }
        );
      }
    } catch (e) {
      console.warn('[POST] /:id/messages - Notification skipped:', e.message);
    }

    console.log('[POST] /:id/messages - Message saved successfully!');
    console.log('[POST] Conversation state after save:', {
      conversationId: convo.conversationId,
      participants: convo.participants,
      messageCount: convo.messages?.length,
      lastMessage: convo.lastMessage
    });

    // Emit message to recipient via Socket.IO for real-time delivery
    try {
      const io = req.app.get('io');
      console.log('[Socket] IO instance available?', !!io);

      if (!io) {
        console.error('[Socket] ❌ IO instance not found on req.app');
      } else {
        // Use the actual conversationId from the saved conversation (not the route param)
        const actualConversationId = convo.conversationId;
        console.log('[Socket] 📡 Emitting newMessage to conversationId:', actualConversationId);
        console.log('[Socket] 📡 Message data:', {
          messageId: message.id,
          senderId: normalizedSenderId,
          recipientId: normalizedRecipientId,
          text: message.text?.substring(0, 30)
        });

        // Emit to conversation room
        const socketPayload = {
          ...message,
          createdAt: typeof message.createdAt?.getTime === 'function' ? message.createdAt.getTime() : (message.createdAt || Date.now()),
          timestamp: typeof message.timestamp?.getTime === 'function' ? message.timestamp.getTime() : (message.timestamp || Date.now()),
          conversationId: actualConversationId
        };
        
        io.to(actualConversationId).emit('newMessage', socketPayload);
        console.log('[Socket] ✅ Emitted message to conversation room:', actualConversationId);

        if (isGroupConversation) {
          const members = Array.isArray(convo?.participants) ? convo.participants.map(String) : [];
          const recipients = members.filter((m) => m !== normalizedSenderId);
          for (const memberId of recipients) {
            io.to(`user_${memberId}`).emit('newMessage', {
              ...message,
              conversationId: actualConversationId
            });
          }
          console.log('[Socket] ✅ Emitted group message to members:', recipients.length);
        } else if (normalizedRecipientId) {
          // Also emit to recipient's personal room
          io.to(`user_${normalizedRecipientId}`).emit('newMessage', {
            ...message,
            conversationId: actualConversationId
          });
          console.log('[Socket] ✅ Emitted to recipient room:', `user_${normalizedRecipientId}`);
        }

        // Also emit to sender's personal room ONLY if they are not in the conversation room
        // or for multi-device sync
        io.to(`user_${normalizedSenderId}`).emit('newMessage', {
          ...message,
          tempId, // Crucial for client-side optimistic UI matching
          conversationId: actualConversationId
        });
        console.log('[Socket] ✅ Emitted to sender room:', `user_${normalizedSenderId}`);

        console.log('[Socket] ✅✅✅ All emits complete!');
      }
    } catch (socketError) {
      console.error('[Socket] ❌ Error emitting message:', socketError);
      console.error('[Socket] ❌ Error stack:', socketError.stack);
      // Don't fail the request if socket emit fails
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error('[POST] /:id/messages - Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get or create conversation
router.post('/get-or-create', verifyToken, async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;

    const User = mongoose.model('User');
    const normalizeToMongo = async (id) => {
      const raw = String(id || '');
      if (!raw) return null;
      if (mongoose.Types.ObjectId.isValid(raw)) return raw;
      const found = await User.findOne({ $or: [{ firebaseUid: raw }, { uid: raw }] }).select('_id');
      return found?._id ? String(found._id) : raw;
    };

    const a = await normalizeToMongo(userId1);
    const b = await normalizeToMongo(userId2);
    if (!a || !b) {
      return res.status(400).json({ success: false, error: 'userId1 and userId2 required' });
    }

    const ids = [a, b].map(String).sort();
    const conversationId = `${ids[0]}_${ids[1]}`;

    const matches = await Conversation.find({
      $or: [
        { conversationId: conversationId },
        {
          $and: [
            { participants: { $all: ids } },
            { $expr: { $eq: [{ $size: '$participants' }, 2] } },
            { isGroup: { $ne: true } }
          ]
        }
      ]
    }).sort({ lastMessageAt: -1 });

    let conversation = matches?.[0] || null;
    if (!conversation) {
      conversation = new Conversation({
        conversationId,
        participants: ids
      });
      await conversation.save();
    }

    res.json({ success: true, id: conversation._id, conversationId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get conversations for user (route param version) with populated data
router.get('/users/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversation.find({ participants: userId }).sort({ lastMessageAt: -1 });

    // Populate participant data
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const enrichedConversations = await Promise.all(conversations.map(async (conversation) => {
      const convObj = conversation.toObject ? conversation.toObject() : conversation;

      // Get other participant (not current user)
      const otherParticipantId = convObj.participants.find(p => p !== userId);

      if (otherParticipantId) {
        const otherUser = await usersCollection.findOne({
          $or: [
            { firebaseUid: otherParticipantId },
            { uid: otherParticipantId },
            { _id: mongoose.Types.ObjectId.isValid(otherParticipantId) ? new mongoose.Types.ObjectId(otherParticipantId) : null }
          ]
        });

        return {
          ...convObj,
          otherParticipant: {
            id: otherParticipantId,
            name: otherUser?.displayName || otherUser?.name || 'User',
            avatar: otherUser?.avatar || otherUser?.photoURL || null
          }
        };
      }

      return convObj;
    }));

    res.json({ success: true, data: enrichedConversations });
  } catch (err) {
    console.error('[GET /conversations/users/:userId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /:conversationId/messages/:messageId - Edit message
router.patch('/:conversationId/messages/:messageId', async (req, res) => {
  try {
    const { userId, text } = req.body;
    const { conversationId, messageId } = req.params;

    console.log('[PATCH] /:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId,
      text: text?.substring(0, 30)
    });

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      console.log('[PATCH] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      console.log('[PATCH] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      console.log('[PATCH] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only edit your own messages' });
    }

    // Update message
    message.text = text;
    message.editedAt = new Date();
    await message.save();

    console.log('[PATCH] Message updated:', messageId);
    res.json({ success: true, data: message });
  } catch (err) {
    console.error('[PATCH] /:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:conversationId/messages/:messageId - Delete message
router.delete('/:conversationId/messages/:messageId', async (req, res) => {
  try {
    const { userId } = req.body;
    const { conversationId, messageId } = req.params;

    console.log('[DELETE] /:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId
    });

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      console.log('[DELETE] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      console.log('[DELETE] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      console.log('[DELETE] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only delete your own messages' });
    }

    // Delete message from collection
    await Message.deleteOne({ _id: message._id });

    console.log('[DELETE] Message deleted:', messageId);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    console.error('[DELETE] /:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:conversationId/messages/:messageId/reactions - React to message
router.post('/:conversationId/messages/:messageId/reactions', async (req, res) => {
  try {
    const { userId, reaction, emoji } = req.body;
    const { conversationId, messageId } = req.params;

    // Accept both 'reaction' and 'emoji' for compatibility
    const actualReaction = reaction || emoji;

    console.log('[POST] /:conversationId/messages/:messageId/reactions - Request:', {
      conversationId,
      messageId,
      userId,
      reaction: actualReaction
    });

    if (!userId || !actualReaction) {
      return res.status(400).json({ success: false, error: 'userId and reaction/emoji required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      console.log('[POST] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      console.log('[POST] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Initialize reactions object if not exists
    if (!message.reactions) {
      message.reactions = {};
    }

    // Initialize reaction array if not exists
    if (!message.reactions.get(actualReaction) && !message.reactions[actualReaction]) {
      if (message.reactions instanceof Map) {
        message.reactions.set(actualReaction, []);
      } else {
        message.reactions[actualReaction] = [];
      }
    }

    // Toggle reaction (Instagram style - add if not present, remove if present)
    const reactionsArray = message.reactions instanceof Map ? message.reactions.get(actualReaction) : message.reactions[actualReaction];
    const userIndex = reactionsArray.indexOf(userId);
    
    if (userIndex === -1) {
      reactionsArray.push(userId);
      console.log('[POST] Added reaction:', actualReaction, 'from user:', userId);
    } else {
      reactionsArray.splice(userIndex, 1);
      console.log('[POST] Removed reaction:', actualReaction, 'from user:', userId);

      // Remove empty reaction arrays
      if (reactionsArray.length === 0) {
        if (message.reactions instanceof Map) {
          message.reactions.delete(actualReaction);
        } else {
          delete message.reactions[actualReaction];
        }
      }
    }

    // Save message
    message.markModified('reactions');
    await message.save();

    console.log('[POST] Reactions updated for message:', messageId);
    res.json({ success: true, data: { reactions: message.reactions } });
  } catch (err) {
    console.error('[POST] /:conversationId/messages/:messageId/reactions error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===== MEDIA UPLOAD ROUTES =====

// POST /upload-media - Upload image/video/audio to message
router.post('/upload-media', verifyToken, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    const { file, mediaType } = req.body; // file is base64 or URL

    if (!file) {
      return res.status(400).json({ success: false, error: 'File required' });
    }

    // Upload to Cloudinary
    const uploadOptions = {
      resource_type: mediaType === 'audio' ? 'auto' : 'auto',
      folder: 'messages'
    };

    if (mediaType === 'video') {
      uploadOptions.video_sampling = 5; // For faster uploads
    }

    const result = await cloudinary.uploader.upload(file, uploadOptions);

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      mediaType,
      duration: result.duration || null
    });
  } catch (err) {
    console.error('[POST] /upload-media error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:conversationId/messages/media - Send media message
router.post('/:conversationId/messages/media', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { 
      senderId, 
      recipientId, 
      mediaUrl, 
      mediaType, 
      audioUrl, 
      audioDuration, 
      text, 
      thumbnailUrl, 
      sharedPost, 
      sharedStory,
      tempId 
    } = req.body;

    const actualSenderId = String(req.userId || senderId || '');

    const effectiveMediaUrl = mediaUrl
      || sharedPost?.imageUrl
      || sharedPost?.thumbnailUrl
      || sharedStory?.mediaUrl
      || null;

    if (!actualSenderId || !mediaType) {
      return res.status(400).json({ success: false, error: 'senderId and mediaType required' });
    }

    // Normalize IDs to Mongo _id strings where possible (same strategy as text route).
    const User = mongoose.model('User');
    let normalizedSenderId = String(actualSenderId);
    if (!mongoose.Types.ObjectId.isValid(normalizedSenderId)) {
      const foundSender = await User.findOne({ $or: [{ firebaseUid: normalizedSenderId }, { uid: normalizedSenderId }] }).select('_id');
      if (foundSender?._id) normalizedSenderId = String(foundSender._id);
    }

    let normalizedRecipientId = recipientId ? String(recipientId) : null;
    if (normalizedRecipientId && !mongoose.Types.ObjectId.isValid(normalizedRecipientId)) {
      const foundRecipient = await User.findOne({ $or: [{ firebaseUid: normalizedRecipientId }, { uid: normalizedRecipientId }] }).select('_id');
      if (foundRecipient?._id) normalizedRecipientId = String(foundRecipient._id);
    }

    if (!effectiveMediaUrl && mediaType !== 'post' && mediaType !== 'story') {
      return res.status(400).json({ success: false, error: 'mediaUrl required for this mediaType' });
    }

    let conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    // Fallback: for direct chats, try finding by participants pair
    if (!conversation && normalizedRecipientId) {
      conversation = await Conversation.findOne({
        $and: [
          { participants: { $all: [String(normalizedSenderId), String(normalizedRecipientId)] } },
          { isGroup: { $ne: true } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ updatedAt: -1 });
    }

    if (!conversation && normalizedRecipientId) {
      // Align with text route behavior: create DM conversation if missing
      const participants = [String(normalizedSenderId), String(normalizedRecipientId)].sort();
      conversation = new Conversation({
        conversationId: `${participants[0]}_${participants[1]}`,
        participants,
        messages: [],
      });
    }

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found for media message' });
    }

    if (!Array.isArray(conversation.messages)) {
      conversation.messages = [];
    }

    // If sender had previously hidden/archived this conversation, revive it on new outgoing media.
    const senderVariants = await resolveUserIdVariants(String(normalizedSenderId));
    const senderSet = new Set([String(normalizedSenderId), ...senderVariants.map(String)]);
    conversation.deletedBy = (Array.isArray(conversation.deletedBy) ? conversation.deletedBy : []).filter((id) => !senderSet.has(String(id)));
    conversation.archivedBy = (Array.isArray(conversation.archivedBy) ? conversation.archivedBy : []).filter((id) => !senderSet.has(String(id)));

    // Also revive for recipient so new incoming messages reappear in inbox.
    if (normalizedRecipientId) {
      const recipientVariants = await resolveUserIdVariants(String(normalizedRecipientId));
      const recipientSet = new Set([String(normalizedRecipientId), ...recipientVariants.map(String)]);
      conversation.deletedBy = (Array.isArray(conversation.deletedBy) ? conversation.deletedBy : []).filter((id) => !recipientSet.has(String(id)));
      conversation.archivedBy = (Array.isArray(conversation.archivedBy) ? conversation.archivedBy : []).filter((id) => !recipientSet.has(String(id)));
    }

    // Create media message
    const message = {
      id: new mongoose.Types.ObjectId().toString(),
      senderId: normalizedSenderId,
      recipientId: normalizedRecipientId,
      text: text || '',
      mediaType,
      mediaUrl: effectiveMediaUrl,
      audioUrl,
      audioDuration,
      thumbnailUrl,
      sharedPost,
      sharedStory,
      tempId, // Link to client-side optimistic UI
      timestamp: new Date(),
      createdAt: new Date(), // Root creation time for sorting
      read: false,
      delivered: false,
      readBy: [normalizedSenderId] // Mark as read for sender
    };

    conversation.messages.push(message);
    conversation.markModified('messages');
    if (mediaType === 'story') {
      conversation.lastMessage = text || '[STORY]';
    } else {
      conversation.lastMessage = text || `[${mediaType.toUpperCase()}]`;
    }
    conversation.lastMessageAt = new Date();
    conversation.updatedAt = new Date();
    await conversation.save();

    console.log('[POST] Media message saved:', message.id);

    // Emit message to all participants via Socket.IO for real-time delivery
    try {
      const io = req.app.get('io');
      if (io) {
        const actualConversationId = conversation.conversationId;
        const isGroupConversation = !!conversation?.isGroup;
        
        // Emit to conversation room
        const socketPayload = {
          ...message,
          createdAt: typeof message.createdAt?.getTime === 'function' ? message.createdAt.getTime() : (message.createdAt || Date.now()),
          timestamp: typeof message.timestamp?.getTime === 'function' ? message.timestamp.getTime() : (message.timestamp || Date.now()),
          conversationId: actualConversationId
        };
        
        io.to(actualConversationId).emit('newMessage', socketPayload);
        console.log('[Socket] ✅ Emitted media message to conversation room:', actualConversationId);

        // For groups, emit to all members' personal rooms
        if (isGroupConversation) {
          const members = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
          const recipients = members.filter((m) => m !== normalizedSenderId);
          for (const memberId of recipients) {
            io.to(`user_${memberId}`).emit('newMessage', {
              ...message,
              conversationId: actualConversationId
            });
          }
          console.log('[Socket] ✅ Emitted media message to group members:', recipients.length);
        } else if (normalizedRecipientId) {
          // For 1:1, emit to recipient's personal room
          io.to(`user_${normalizedRecipientId}`).emit('newMessage', {
            ...message,
            conversationId: actualConversationId
          });
          console.log('[Socket] ✅ Emitted media message to recipient room:', `user_${normalizedRecipientId}`);
        }

        // Emit to sender's personal room for multi-device sync
        io.to(`user_${normalizedSenderId}`).emit('newMessage', {
          ...message,
          tempId,
          conversationId: actualConversationId
        });
        console.log('[Socket] ✅ Emitted media message to sender room:', `user_${normalizedSenderId}`);
      }
    } catch (socketError) {
      console.warn('[Socket] ⚠️ Warning emitting media message:', socketError.message);
      // Don't fail the request if socket emit fails
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    console.error('[POST] /messages/media error:', err.message);
    console.error('[POST] /messages/media stack:', err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /stories - Create story
router.post('/stories', verifyToken, async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { userId, mediaUrl, mediaType, caption, userName, userAvatar } = req.body;

    if (!userId || !mediaUrl) {
      return res.status(400).json({ success: false, error: 'userId and mediaUrl required' });
    }

    const story = await Story.create({
      userId,
      image: mediaType === 'image' ? mediaUrl : null,
      video: mediaType === 'video' ? mediaUrl : null,
      caption,
      userName,
      userAvatar,
      views: [],
      likes: [],
      comments: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    console.log('[POST] Story created:', story._id);
    res.status(201).json({ success: true, data: story });
  } catch (err) {
    console.error('[POST] /stories error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /stories/user/:userId - Get user stories
router.get('/stories/user/:userId', async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { userId } = req.params;

    const stories = await Story.find({
      userId,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: stories });
  } catch (err) {
    console.error('[GET] /stories/user/:userId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /stories/feed - Get all stories from following
router.get('/stories/feed', async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).limit(100);

    res.json({ success: true, data: stories });
  } catch (err) {
    console.error('[GET] /stories/feed error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /stories/:storyId/view - Mark story as viewed
router.post('/stories/:storyId/view', async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { storyId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const story = await Story.findByIdAndUpdate(
      storyId,
      { $addToSet: { views: userId } },
      { new: true }
    );

    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    res.json({ success: true, data: story });
  } catch (err) {
    console.error('[POST] /stories/:storyId/view error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
