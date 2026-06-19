import { z } from 'zod';

export const Role = z.enum(['owner', 'shop_seller', 'factory_sender', 'super_admin', 'accountant']);

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_]+$/, 'username must be lowercase letters, digits, or underscores'),
  password: z.string().min(8),
  full_name_ar: z.string().min(1).max(128),
  role: z.enum(['owner', 'shop_seller', 'factory_sender', 'accountant']),
  force_password_change: z.boolean().optional(),
});

export const UpdateUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9_]+$/, 'username must be lowercase letters, digits, or underscores').optional(),
  full_name_ar: z.string().min(1).max(128).optional(),
  role: z.enum(['owner', 'shop_seller', 'factory_sender', 'accountant']).optional(),
  password: z.string().min(8).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at least one field required' });

export const ResetPasswordSchema = z.object({
  password: z.string().min(8),
  force_password_change: z.boolean().optional(),
});

// Allowed action values match the role_permissions.action CHECK constraint as widened by
// migrations 037 (read/write/approve), 052 (HR view/manage/salary.disburse/advance.create/
// deduction.create), and 068 (suppliers payments.write). Keep this list in sync if the
// constraint changes.
const PERMISSION_ACTIONS = [
  'read', 'write', 'approve',
  'view', 'manage',
  'salary.disburse', 'advance.create', 'deduction.create',
  'payments.write',
] as const;

export const UpdateUserPermissionsSchema = z.array(
  z.object({
    resource: z.string().min(1).max(64),
    action: z.enum(PERMISSION_ACTIONS, {
      errorMap: () => ({ message: 'إجراء غير مسموح به' }),
    }),
    is_allowed: z.boolean().nullable(),
  }),
).min(1);
