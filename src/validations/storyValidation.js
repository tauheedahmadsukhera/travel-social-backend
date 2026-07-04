const { z } = require('zod');

const createStorySchema = z.object({
  body: z.object({
    userName: z.string().optional(),
    mediaUrl: z.string().url('Invalid media URL'),
    mediaType: z.enum(['image', 'video']).optional(),
    caption: z.string().max(500, 'Caption is too long').optional().nullable(),
    locationData: z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      placeId: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }).optional().nullable(),
    thumbnailUrl: z.string().optional().nullable(),
    thumbnail: z.string().optional().nullable(),
    isPostShare: z.boolean().optional(),
    visibility: z.string().optional(),
    allowedFollowers: z.array(z.string()).optional(),
    isPrivate: z.boolean().optional(),
  })
});

module.exports = {
  createStorySchema
};
