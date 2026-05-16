const { z } = require('zod');

const followUserSchema = z.object({
  body: z.object({
    followingId: z.string().min(1, 'followingId is required'),
  })
});

const followRequestSchema = z.object({
  body: z.object({
    fromUserId: z.string().optional(), // Often taken from token
    toUserId: z.string().min(1, 'toUserId is required'),
  })
});

module.exports = {
  followUserSchema,
  followRequestSchema
};
