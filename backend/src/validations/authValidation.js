const { z } = require('zod');

const loginFirebaseSchema = z.object({
  body: z.object({
    idToken: z.string().optional(),
    firebaseUid: z.string().min(1, 'Firebase UID is required'),
    email: z.string().nullable().optional(), 
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  })
});

const registerFirebaseSchema = z.object({
  body: z.object({
    idToken: z.string().optional(),
    firebaseUid: z.string().min(1, 'Firebase UID is required'),
    email: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    displayName: z.string().optional(),
  })
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().length(6, 'Code must be exactly 6 digits'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  })
});

module.exports = {
  loginFirebaseSchema,
  registerFirebaseSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
