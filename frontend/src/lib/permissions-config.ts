/**
 * Re-exports the authoritative permissions catalog from the shared workspace module.
 * The single source of truth is shared/permissions/catalog.ts — edit that file,
 * not this one.
 */
export type {
  PermAction,
  ResourceDef,
  ResourceGroup,
  PermRow,
  RoleDefaultsMap,
} from '@shared/permissions/catalog';

export {
  RESOURCE_GROUPS,
  ALL_RESOURCE_KEYS,
  ROLE_DEFAULTS,
  HARD_DENY,
} from '@shared/permissions/catalog';
