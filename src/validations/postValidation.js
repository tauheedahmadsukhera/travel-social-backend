const { z } = require('zod');

const createPostSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required').max(5000, 'Content exceeds 5000 characters'),
    caption: z.string().max(1000, 'Caption exceeds 1000 characters').optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    mediaUrls: z.array(z.string().url()).optional(),
    mediaType: z.enum(['image', 'video']).optional(),
    thumbnailUrl: z.string().optional().nullable(),
    aspectRatio: z.number().optional().nullable(),
    location: z.string().optional().nullable(),
    locationData: z.any().optional(),
    locationKeys: z.array(z.string()).optional(),
    category: z.string().optional().nullable(),
    hashtags: z.array(z.string()).optional(),
    mentions: z.array(z.string()).optional(),
    taggedUserIds: z.array(z.string()).optional(),
    isPrivate: z.boolean().optional(),
    visibility: z.string().optional(),
    allowedFollowers: z.array(z.string()).optional(),
  })
});

const updatePostSchema = z.object({
  body: z.object({
    content: z.string().max(5000, 'Content exceeds 5000 characters').optional(),
    caption: z.string().max(1000, 'Caption exceeds 1000 characters').optional().nullable(),
    location: z.string().optional().nullable(),
    locationData: z.any().optional(),
    category: z.string().optional().nullable(),
    hashtags: z.array(z.string()).optional(),
    mentions: z.array(z.string()).optional(),
    taggedUserIds: z.array(z.string()).optional(),
    isPrivate: z.boolean().optional(),
    visibility: z.string().optional(),
    allowedFollowers: z.array(z.string()).optional(),
  })
});

module.exports = {
  createPostSchema,
  updatePostSchema
};
