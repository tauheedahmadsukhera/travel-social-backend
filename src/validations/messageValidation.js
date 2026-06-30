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
  }).refine((data) => data.senderId || data.sender, {
    message: "Missing senderId or sender",
    path: ["senderId"]
  })
});

module.exports = {
  sendMessageSchema
};
