import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const authSchemas = {
    register: {
        body: z.object({
            // Whitelist characters for name to prevent XSS and SQL injection
            // Allow unicode letters/numbers, spaces, hyphens, periods, and apostrophes
            name: commonSchemas.safeName,
            email: commonSchemas.email,
            password: z.string()
                .min(8, 'Password must be at least 8 characters')
                .regex(/[0-9]/, 'Password must contain at least one number')
                .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character')
                .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
                .regex(/[A-Z]/, 'Password must contain at least one uppercase letter'),
            role: z.enum(['developer', 'advisor', 'admin', 'manager', 'client']),
        }),
    },

    login: {
        body: z.object({
            email: commonSchemas.email,
            password: z.string().min(1, 'Password is required'),
        }),
    },

    updateProfile: {
        body: z.object({
            // Consistent strict validation for name update
            name: commonSchemas.safeName.optional(),
            email: commonSchemas.email.optional(),
        }).refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
        }),
    },

    forgotPassword: {
        body: z.object({
            email: commonSchemas.email,
        }),
    },

    resetPassword: {
        body: z.object({
            token: z.string().min(1, 'Token is required'),
            newPassword: z.string().min(8, 'Password must be at least 8 characters'),
        }),
    },
};








