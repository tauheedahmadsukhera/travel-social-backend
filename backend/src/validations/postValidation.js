const { z } = require('zod');

const createPostSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
    caption: z.string().optional(),
    imageUrl: z.string().url().optional(),
    mediaUrls: z.array(z.string().url()).optional(),
    mediaType: z.enum(['image', 'video']).optional(),
    location: z.string().optional(),
    category: z.string().optional(),
    isPrivate: z.boolean().optional(),
    visibility: z.enum(['Everyone', 'Friends', 'Family']).optional(),
  })
});

const updatePostSchema = z.object({
  body: z.object({
    content: z.string().optional(),
    caption: z.string().optional(),
    location: z.string().optional(),
    category: z.string().optional(),
    isPrivate: z.boolean().optional(),
    visibility: z.enum(['Everyone', 'Friends', 'Family']).optional(),
  })
});

module.exports = {
  createPostSchema,
  updatePostSchema
};
