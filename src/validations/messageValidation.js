const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.object({
    senderId: z.string().optional(),
    sender: z.string().optional(),
    text: z.string().nullable().optional(),
    recipientId: z.string().nullable().optional(),
    read: z.boolean().nullable().optional(),
    mediaType: z.string().nullable().optional(),
    mediaUrl: z.string().nullable().optional(),
    mediaUrls: z.array(z.string()).nullable().optional(),
    audioUrl: z.string().nullable().optional(),
    audioDuration: z.number().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    tempId: z.string().nullable().optional(),
    replyTo: z.object({
      messageId: z.string(),
      text: z.string(),
      senderId: z.string()
    }).optional(),
    sharedPost: z.object({
      postId: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      mediaUrls: z.array(z.string()).nullable().optional(),
      mediaCount: z.number().nullable().optional(),
      text: z.string().nullable().optional(),
      caption: z.string().nullable().optional(),
      userId: z.string().nullable().optional(),
      userDisplayName: z.string().nullable().optional(),
      userName: z.string().nullable().optional(),
      userAvatar: z.string().nullable().optional(),
    }).nullable().optional(),
    sharedStory: z.object({
      storyId: z.string().nullable().optional(),
      id: z.string().nullable().optional(),
      mediaUrl: z.string().nullable().optional(),
      mediaType: z.string().nullable().optional(),
      userId: z.string().nullable().optional(),
      userName: z.string().nullable().optional(),
      userAvatar: z.string().nullable().optional(),
    }).nullable().optional(),
  }).refine((data) => data.senderId || data.sender, {
    message: "Missing senderId or sender",
    path: ["senderId"]
  })
});

const createConversationSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Group name is required'),
    avatar: z.string().optional(),
    description: z.string().optional(),
    memberIds: z.array(z.string()).min(1, 'At least one member is required'),
  })
});

module.exports = {
  sendMessageSchema,
  createConversationSchema
};
