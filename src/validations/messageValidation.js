const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.object({
    senderId: z.string().optional(),
    sender: z.string().optional(),
    text: z.string().optional(),
    recipientId: z.string().optional(),
    read: z.boolean().optional(),
    mediaType: z.string().optional(),
    mediaUrl: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
    audioUrl: z.string().optional(),
    audioDuration: z.number().optional(),
    thumbnailUrl: z.string().optional(),
    tempId: z.string().optional(),
    replyTo: z.object({
      messageId: z.string(),
      text: z.string(),
      senderId: z.string()
    }).optional(),
    sharedPost: z.object({
      postId: z.string().optional(),
      imageUrl: z.string().optional(),
      mediaUrls: z.array(z.string()).optional(),
      mediaCount: z.number().optional(),
      text: z.string().optional(),
      caption: z.string().optional(),
      userId: z.string().optional(),
      userDisplayName: z.string().optional(),
      userName: z.string().optional(),
      userAvatar: z.string().optional(),
    }).optional(),
    sharedStory: z.object({
      storyId: z.string().optional(),
      id: z.string().optional(),
      mediaUrl: z.string().optional(),
      mediaType: z.string().optional(),
      userId: z.string().optional(),
      userName: z.string().optional(),
      userAvatar: z.string().optional(),
    }).optional(),
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
