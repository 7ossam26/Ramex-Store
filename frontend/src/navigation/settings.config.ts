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
  Banknote,
  Building2,
  ClipboardList,
  Database,
  Hash,
  Info,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type SettingsSectionId =
  | 'general'
  | 'cashDrawer'
  | 'usersPermissions'
  | 'reasonCodes'
  | 'dayRollover'
  | 'system'
  | 'fabricCodes';

export type SettingsSection = {
  id: SettingsSectionId;
  labelAr: string;
  descAr: string;
  icon: LucideIcon;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    labelAr: 'المعلومات العامة',
    descAr: 'بيانات المحل: الشعار، العنوان، الهاتف، الرقم الضريبي ونص التحذير على الإيصال',
    icon: Info,
  },
  {
    id: 'cashDrawer',
    labelAr: 'خزنة الكاش',
    descAr: 'الرصيد الافتتاحي لخزنة الكاش (للعرض فقط بعد الإعداد)',
    icon: Banknote,
  },
  {
    id: 'usersPermissions',
    labelAr: 'المستخدمون والصلاحيات',
    descAr: 'إضافة المستخدمين وتحديد صلاحيات كل دور',
    icon: ShieldCheck,
  },
  {
    id: 'reasonCodes',
    labelAr: 'أكواد الأسباب',
    descAr: 'تحرير أسباب التلف، فئات المصروفات وأسباب الإلغاء',
    icon: ClipboardList,
  },
  {
    id: 'dayRollover',
    labelAr: 'وقت تجديد اليوم',
    descAr: 'وقت بداية اليوم المحاسبي (HH:MM)',
    icon: Building2,
  },
  {
    id: 'system',
    labelAr: 'النظام',
    descAr: 'إعدادات النظام المركزية ومعلومات الاحتفاظ بالسجلات',
    icon: Database,
  },
  {
    id: 'fabricCodes',
    labelAr: 'كودات الملصقات',
    descAr: 'الدرجات، التركيبات، الماركات والموردين على ملصقات التوبات',
    icon: Hash,
  },
];

export const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map((s) => s.id);

export function settingsSectionById(id: SettingsSectionId): SettingsSection {
  // Tuple guarantees a hit; non-null assertion safe by construction.
  return SETTINGS_SECTIONS.find((s) => s.id === id)!;
}
