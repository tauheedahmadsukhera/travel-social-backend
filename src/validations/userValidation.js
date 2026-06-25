const { z } = require('zod');

const updateProfileSchema = z.object({
  body: z.object({
    displayName: z.string().min(1, 'Display name cannot be empty').optional(),
    avatar: z.string().url().or(z.string().regex(/^data:image\/.*;base64,/)).optional(),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
    location: z.string().optional(),
    website: z.string().url().or(z.string().length(0)).optional(),
    phoneNumber: z.string().optional(),
    isPrivate: z.boolean().optional(),
    lastKnownLocation: z.object({
      city: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      place: z.string().optional(),
      timestamp: z.number().optional(),
    }).optional(),
  })
});

module.exports = {
  updateProfileSchema
};
