import { z } from 'zod';

export const Role = z.enum(['owner', 'shop_seller', 'factory_sender', 'super_admin', 'accountant']);

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_]+$/, 'username must be lowercase letters, digits, or underscores'),
  password: z.string().min(8),
  full_name_ar: z.string().min(1).max(128),
  role: z.enum(['owner', 'shop_seller', 'factory_sender', 'accountant']),
});

export const UpdateUserSchema = z.object({
  full_name_ar: z.string().min(1).max(128).optional(),
  role: z.enum(['owner', 'shop_seller', 'factory_sender', 'accountant']).optional(),
  password: z.string().min(8).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at least one field required' });

export const ResetPasswordSchema = z.object({
  password: z.string().min(8),
});

export const UpdateUserPermissionsSchema = z.array(
  z.object({
    resource: z.string().min(1).max(64),
    action: z.enum(['read', 'write', 'approve']),
    is_allowed: z.boolean().nullable(),
  }),
).min(1);
