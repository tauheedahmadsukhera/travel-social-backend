const { z } = require('zod');

const savePostSchema = z.object({
  body: z.object({
    postId: z.string().min(1, 'Post ID is required'),
  })
});

module.exports = {
  savePostSchema
};
