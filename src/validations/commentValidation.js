const { z } = require('zod');

const createCommentSchema = z.object({
  body: z.object({
    text: z.string().min(1, 'Comment text is required'),
  }),
  params: z.object({
    postId: z.string().min(1, 'Post ID is required'),
  })
});

module.exports = {
  createCommentSchema
};
