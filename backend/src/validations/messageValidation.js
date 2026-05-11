const { z } = require('zod');

// Allow empty strings to pass through URL validation (frontend sends "" for optional media)
const optionalUrl = z.union([z.string().url(), z.literal(''), z.null(), z.undefined()]).optional();

const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().optional(),       // Content can be empty if media is present
    text: z.string().optional(),           // Alias for content
    senderId: z.string().optional(),       // Sender ID
    sender: z.string().optional(),         // Alias for senderId
    recipientId: z.string().optional(),
    tempId: z.string().optional(),
    mediaUrl: optionalUrl,
    mediaType: z.string().optional(),
    audioUrl: optionalUrl,
    videoUrl: optionalUrl,
    thumbnailUrl: optionalUrl,
    audioDuration: z.number().optional(),
    read: z.boolean().optional(),
    replyTo: z.any().optional(),
    sharedPost: z.any().optional(),
    sharedStory: z.any().optional(),
  }).passthrough().refine(data => 
    data.content || data.text || data.mediaUrl || data.audioUrl || data.sharedPost || data.sharedStory || data.mediaType, {
    message: "Message must contain text, media, or shared content"
  })
});

const createConversationSchema = z.object({
  body: z.object({
    participantIds: z.array(z.string()).min(1, 'At least one participant is required'),
    isGroup: z.boolean().optional(),
    name: z.string().optional(),
  })
});

module.exports = {
  sendMessageSchema,
  createConversationSchema
};
