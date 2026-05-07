import { z } from 'zod';

const PHONE_RE = /^(01[0125]\d{8})?$/; // empty string allowed (not yet set)

export const SETTINGS_SCHEMAS = {
  'shop.logo_path':           z.string().nullable().default(null),
  'shop.address_ar':          z.string().default(''),
  'shop.phone':               z.string().regex(PHONE_RE, 'رقم هاتف غير صحيح').default(''),
  'shop.tax_no':              z.string().default(''),
  'receipt.warning_text_ar':  z.string().default('الطوب بعد القص غير مرتجع. يوجد استبدال خلال ١٤ يوم من تاريخ الشراء.'),
  'tax.enabled':              z.boolean().default(false),
  'tax.rate':                 z.number().min(0).max(1).default(0.14),
  'tax.label_ar':             z.string().default('ضريبة'),
  'pos.min_deposit_pct':      z.number().min(0).max(1).default(0.25),
  'pos.void_time_limit_hours':z.number().int().min(0).default(24),
  'pos.approval_threshold_egp': z.number().min(0).default(5000),
  'pos.stale_invoice_days':   z.number().int().min(1).default(7),
  'pos.return_window_days':   z.number().int().min(0).default(14),
  'day_rollover.time':        z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  'barcode.label_size':       z.string().default('50x30mm'),
  'barcode.label_fields':     z.array(z.string()).default(['fabric', 'color', 'weight', 'barcode']),
  'reason_codes.damage': z.array(z.object({
    code: z.string(),
    name_ar: z.string(),
    default_disposition: z.string().optional(),
  })).default([
    { code: 'damage_in_transit',       name_ar: 'تلف أثناء النقل',      default_disposition: 'damaged_stock' },
    { code: 'damage_in_shop',          name_ar: 'تلف داخل المحل',       default_disposition: 'damaged_stock' },
    { code: 'damage_quality_defect',   name_ar: 'عيب في الجودة',         default_disposition: 'damaged_stock' },
    { code: 'loss_theft',              name_ar: 'سرقة',                  default_disposition: 'auto_writeoff' },
    { code: 'loss_misplaced',          name_ar: 'فقد / مكان مجهول',     default_disposition: 'auto_writeoff' },
    { code: 'inventory_discrepancy',   name_ar: 'فرق جرد',               default_disposition: 'damaged_stock' },
    { code: 'cutting_sample_loss',     name_ar: 'فقد قص / عينة',        default_disposition: 'auto_writeoff' },
    { code: 'other',                   name_ar: 'أخرى',                  default_disposition: 'damaged_stock' },
  ]),
  'reason_codes.expense': z.array(z.object({
    code: z.string(),
    name_ar: z.string(),
  })).default([
    { code: 'rent',      name_ar: 'إيجار'      },
    { code: 'utilities', name_ar: 'مرافق'       },
    { code: 'supplies',  name_ar: 'مستلزمات'   },
    { code: 'salary',    name_ar: 'رواتب'       },
    { code: 'repair',    name_ar: 'صيانة'       },
    { code: 'other',     name_ar: 'أخرى'        },
  ]),
  'reason_codes.cancellation': z.array(z.object({
    code: z.string(),
    name_ar: z.string(),
  })).default([
    { code: 'customer_request',   name_ar: 'طلب العميل'          },
    { code: 'stock_unavailable',  name_ar: 'البضاعة غير متاحة'   },
    { code: 'price_dispute',      name_ar: 'خلاف على السعر'       },
    { code: 'other',              name_ar: 'أخرى'                  },
  ]),
  'audit.retention': z.literal('forever').default('forever'),
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;

// Maps new namespaced key → old legacy key for backward-compat writes
export const LEGACY_KEY_MAP: Partial<Record<SettingKey, string>> = {
  'shop.logo_path':             'logo_path',
  'shop.address_ar':            'shop_address_ar',
  'shop.phone':                 'shop_phone',
  'shop.tax_no':                'shop_tax_id',
  'receipt.warning_text_ar':    'receipt_warning_ar',
  'tax.enabled':                'tax_enabled',
  'tax.rate':                   'tax_rate',
  'pos.min_deposit_pct':        'min_deposit_pct',
  'pos.void_time_limit_hours':  'void_time_limit_hours',
  'pos.approval_threshold_egp': 'approval_threshold_egp',
  'pos.stale_invoice_days':     'stale_invoice_days',
  'pos.return_window_days':     'return_window_days',
  'day_rollover.time':          'day_rollover_time',
  'barcode.label_size':         'barcode_label_size',
  'barcode.label_fields':       'barcode_label_fields',
  'reason_codes.damage':        'damage_reason_codes',
};
