const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.object({
    senderId: z.string().optional(),
    sender: z.string().optional(),
    text: z.string().min(1, 'Message text cannot be empty'),
    recipientId: z.string().optional(),
    read: z.boolean().optional(),
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
