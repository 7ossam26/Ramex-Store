/* =============================================================
 * RMX Store — Settings sub-nav config (Phase 6)
 *
 * Single source of truth for the Settings page's vertical sub-nav
 * (desktop) and horizontal chip row (mobile). Mirrors the shape of
 * `navigation/nav.config.ts` but scoped to the 10 settings sections
 * defined in docs/RMX_REDESIGN_AUDIT.md §12.
 *
 * Section IDs match the `Section` union inside SettingsPage and the
 * keys under `ar.settings.sections.*` in src/i18n/ar.ts.
 * ============================================================= */
import {
  ClipboardList,
  DatabaseZap,
  Hash,
  Info,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/auth';

export type SettingsSectionId =
  | 'general'
  | 'usersPermissions'
  | 'reasonCodes'
  | 'fabricCodes'
  | 'system';

export type SettingsSection = {
  id: SettingsSectionId;
  labelAr: string;
  descAr: string;
  icon: LucideIcon;
  /** If set, only users whose role is in this list can see this section. */
  visibleTo?: Role[];
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    labelAr: 'المعلومات العامة',
    descAr: 'بيانات المحل: الشعار، العنوان، الهاتف، الرقم الضريبي ونص التحذير على الإيصال',
    icon: Info,
  },
  {
    id: 'usersPermissions',
    labelAr: 'المستخدمون والصلاحيات',
    descAr: 'إضافة المستخدمين وتحديد صلاحيات كل دور',
    icon: ShieldCheck,
    visibleTo: ['super_admin'],
  },
  {
    id: 'reasonCodes',
    labelAr: 'أكواد الأسباب',
    descAr: 'تحرير أسباب التلف، فئات المصروفات وأسباب الإلغاء',
    icon: ClipboardList,
  },
  {
    id: 'fabricCodes',
    labelAr: 'كودات الملصقات',
    descAr: 'الدرجات، التركيبات، الماركات والموردين على ملصقات الاتواب',
    icon: Hash,
  },
  {
    id: 'system',
    labelAr: 'النظام',
    descAr: 'صيانة النظام وتصفير قاعدة البيانات',
    icon: DatabaseZap,
    visibleTo: ['super_admin'],
  },
];

export const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map((s) => s.id);

export function settingsSectionById(id: SettingsSectionId): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s.id === id)!;
}

/** Returns only the sections visible to the given role. */
export function visibleSettingsSections(role: Role | undefined): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => !s.visibleTo || (role && s.visibleTo.includes(role)));
}
