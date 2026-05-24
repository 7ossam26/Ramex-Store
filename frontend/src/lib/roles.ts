import type { Role } from './auth';

export const isSuperAdmin = (role: Role | undefined): boolean =>
  role === 'super_admin';

export const isOwnerOrAbove = (role: Role | undefined): boolean =>
  role === 'owner' || role === 'super_admin';
