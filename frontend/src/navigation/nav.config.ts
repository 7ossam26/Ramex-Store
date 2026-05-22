/* =============================================================
 * RMX Store — central navigation config (Phase 2)
 *
 * Single source of truth for:
 *  - the global Rail (top-level sections)
 *  - Flyouts (children of sections that have them)
 *  - the Mobile Drawer (accordion-style mirror of the rail)
 *  - the Command Palette (route-navigation commands)
 *  - page title resolution for the TopBar
 *
 * Authoritative IA: docs/RMX_REDESIGN_AUDIT.md §12.
 * Screenshots are reference only.
 *
 * Shape (matches Phase 2 prompt):
 *   NavTop  = { id, labelAr, descAr?, icon, route, children?: NavGroup[] }
 *   NavGroup = { groupLabelAr?, items: NavLeaf[] }
 *   NavLeaf = { id, labelAr, descAr?, icon, route }
 * ============================================================= */
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Banknote,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Hash,
  Home,
  History,
  Landmark,
  Layers,
  List,
  Package,
  PieChart,
  Plus,
  PlusCircle,
  Receipt,
  Scale,
  ScrollText,
  Settings as SettingsIcon,
  ShoppingCart,
  Sliders,
  Tag,
  TrendingDown,
  Truck,
  Undo2,
  User,
  Users,
  Wallet,
  Warehouse,
  UserCheck,
  DollarSign,
  ArrowDownUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/auth';

export type SectionId =
  | 'home'
  | 'pos'
  | 'items'
  | 'inventory'
  | 'codes'
  | 'shipments'
  | 'customers'
  | 'invoicesReturns'
  | 'treasury'
  | 'reports'
  | 'hr'
  | 'settings';

export type NavLeaf = {
  id: string;
  labelAr: string;
  descAr?: string;
  icon: LucideIcon;
  route: string;
  visibleTo?: Role[];
};

export type NavGroup = {
  groupLabelAr?: string;
  items: NavLeaf[];
};

export type NavTop = {
  id: SectionId;
  labelAr: string;
  descAr?: string;
  icon: LucideIcon;
  route: string;
  visibleTo?: Role[];
  /** When omitted, clicking the rail icon navigates directly to `route`. */
  children?: NavGroup[];
};

/* ---------- Top-level sections (rail order, RTL) ---------- */

export const NAV: NavTop[] = [
  {
    id: 'home',
    labelAr: 'الرئيسية',
    descAr: 'ملخص اليوم ولوحة التحكم',
    icon: Home,
    route: '/',
  },
  {
    id: 'pos',
    labelAr: 'نقطة البيع',
    descAr: 'فتح فاتورة جديدة ومسح الباركود',
    icon: ShoppingCart,
    route: '/pos',
    visibleTo: ['owner', 'shop_seller'],
  },
  {
    id: 'items',
    labelAr: 'الأصناف',
    descAr: 'إدارة التوبات والملصقات',
    icon: Package,
    route: '/items',
    children: [
      {
        items: [
          {
            id: 'items.addTop',
            labelAr: 'إضافة توب',
            descAr: 'تسجيل توب جديد بكل بياناته',
            icon: Plus,
            route: '/items/tops/add',
          },
          {
            id: 'items.rolls',
            labelAr: 'التوبات',
            descAr: 'بحث وتصفية كل التوبات',
            icon: Layers,
            route: '/items/rolls',
          },
          {
            id: 'items.fabrics',
            labelAr: 'الخامات',
            descAr: 'كتالوج الخامات (الاسم، الجودة، التركيب، العرض)',
            icon: Layers,
            route: '/items/fabrics',
          },
          {
            id: 'items.labels',
            labelAr: 'الملصقات',
            descAr: 'إعادة طباعة ملصقات التوبات',
            icon: Tag,
            route: '/items/labels',
          },
        ],
      },
    ],
  },
  {
    id: 'inventory',
    labelAr: 'المخزون',
    descAr: 'الخامات والحركات والجرد',
    icon: Warehouse,
    route: '/inventory',
    children: [
      {
        items: [
          {
            id: 'inventory.stock',
            labelAr: 'نظرة عامة على المخزون',
            descAr: 'مستويات المخزون والأسعار ومتابعة النواقص',
            icon: Warehouse,
            route: '/inventory/stock',
          },
          {
            id: 'inventory.movements',
            labelAr: 'حركات المخزون',
            descAr: 'سجل دخول وخروج التوبات',
            icon: ArrowLeftRight,
            route: '/inventory/stock-movements',
          },
          {
            id: 'inventory.stocktake',
            labelAr: 'الجرد',
            descAr: 'جرد توبي أو تجميعي',
            icon: ClipboardCheck,
            route: '/inventory/stocktake',
          },
          {
            id: 'inventory.adjustments',
            labelAr: 'التسويات',
            descAr: 'تسجيل تسويات يدوية',
            icon: Sliders,
            route: '/inventory/adjustments',
          },
          {
            id: 'inventory.damage',
            labelAr: 'أحداث التلف والفقد',
            descAr: 'تسجيل التلف والفقد',
            icon: AlertTriangle,
            route: '/inventory/damage',
          },
        ],
      },
    ],
  },
  {
    id: 'codes',
    labelAr: 'التكويدات',
    descAr: 'الجودات والتركيبات والماركات والموردين',
    icon: Hash,
    route: '/codes',
  },
  {
    id: 'shipments',
    labelAr: 'الطلبيات',
    descAr: 'إنشاء ومراجعة طلبيات المصنع',
    icon: Truck,
    route: '/shipments',
    visibleTo: ['owner', 'shop_seller', 'factory_sender'],
    children: [
      {
        items: [
          {
            id: 'shipments.create',
            labelAr: 'إنشاء طلبية',
            descAr: 'تسجيل طلبية مصنع جديدة',
            icon: PlusCircle,
            route: '/shipments/create',
            visibleTo: ['owner', 'factory_sender'],
          },
          {
            id: 'shipments.pending',
            labelAr: 'بانتظار المراجعة',
            descAr: 'طلبيات في انتظار اعتماد المحل',
            icon: Clock,
            route: '/shipments/pending',
            visibleTo: ['owner', 'shop_seller'],
          },
          {
            id: 'shipments.all',
            labelAr: 'كل الطلبيات',
            descAr: 'عرض كل الطلبيات',
            icon: List,
            route: '/shipments/all',
          },
        ],
      },
    ],
  },
  {
    id: 'customers',
    labelAr: 'العملاء',
    descAr: 'سجل العملاء وأرصدتهم',
    icon: Users,
    route: '/customers',
  },
  {
    id: 'invoicesReturns',
    labelAr: 'الفواتير والمرتجعات',
    descAr: 'الفواتير وعمليات الإرجاع',
    icon: Receipt,
    route: '/invoices-returns',
    children: [
      {
        items: [
          {
            id: 'invoicesReturns.invoices',
            labelAr: 'الفواتير',
            descAr: 'كل الفواتير: مفتوحة ومكتملة وملغاة',
            icon: FileText,
            route: '/invoices',
          },
          {
            id: 'invoicesReturns.returns',
            labelAr: 'المرتجعات',
            descAr: 'تسجيل ومتابعة الإرجاع والاستبدال',
            icon: Undo2,
            route: '/returns',
          },
        ],
      },
    ],
  },
  {
    id: 'treasury',
    labelAr: 'الخزينة',
    descAr: 'الكاش والبنوك والمصروفات',
    icon: Wallet,
    route: '/treasury',
    children: [
      {
        items: [
          {
            id: 'treasury.overview',
            labelAr: 'نظرة عامة على الخزائن',
            descAr: 'ملخص أرصدة الكاش والبنوك',
            icon: PieChart,
            route: '/treasury/overview',
            visibleTo: ['owner'],
          },
          {
            id: 'treasury.cash',
            labelAr: 'الخزنة الكاش',
            descAr: 'الرصيد والحركات اليومية للكاش',
            icon: Banknote,
            route: '/cash',
          },
          {
            id: 'treasury.banks',
            labelAr: 'البنوك',
            descAr: 'الحسابات البنكية وحركات الانستاباي',
            icon: Landmark,
            route: '/banks',
          },
          {
            id: 'treasury.expenses',
            labelAr: 'المصروفات',
            descAr: 'تسجيل المصروفات والمراجعة',
            icon: TrendingDown,
            route: '/expenses',
          },
          {
            id: 'treasury.reconcile',
            labelAr: 'التسوية اليومية',
            descAr: 'إغلاق اليوم: المتوقع مقابل الفعلي',
            icon: Calculator,
            route: '/reconcile',
          },
        ],
      },
    ],
  },
  {
    id: 'reports',
    labelAr: 'التقارير',
    descAr: 'التقرير اليومي والتقارير الفرعية',
    icon: BarChart3,
    route: '/reports',
    children: [
      {
        items: [
          {
            id: 'reports.daily',
            labelAr: 'التقرير اليومي',
            descAr: 'ملخص اليوم: مبيعات وخصومات وحركات الخزنة',
            icon: CalendarDays,
            route: '/reports/daily',
          },
        ],
      },
      {
        groupLabelAr: 'المخزون والمستودع',
        items: [
          {
            id: 'reports.stockByWarehouse',
            labelAr: 'المخزون حسب المخزن',
            icon: Warehouse,
            route: '/reports/secondary/stockByWarehouse',
          },
          {
            id: 'reports.agingInventory',
            labelAr: 'التوبات الراكدة',
            icon: Clock,
            route: '/reports/secondary/agingInventory',
          },
          {
            id: 'reports.shipmentsSummary',
            labelAr: 'ملخص الطلبيات',
            icon: Truck,
            route: '/reports/secondary/shipmentsSummary',
          },
          {
            id: 'reports.damageLoss',
            labelAr: 'التلف والفقد',
            icon: AlertTriangle,
            route: '/reports/secondary/damageLoss',
          },
        ],
      },
      {
        groupLabelAr: 'مبيعات الخامات',
        items: [
          {
            id: 'reports.salesByFabricColor',
            labelAr: 'مبيعات حسب الخامة واللون',
            icon: BarChart3,
            route: '/reports/secondary/salesByFabricColor',
          },
        ],
      },
      {
        groupLabelAr: 'النظام',
        items: [
          {
            id: 'reports.auditLog',
            labelAr: 'سجل المراجعة',
            icon: History,
            route: '/reports/secondary/auditLog',
          },
        ],
      },
    ],
  },
  {
    id: 'hr',
    labelAr: 'الموارد البشرية',
    descAr: 'الموظفون، الرواتب، والتسويات',
    icon: UserCheck,
    route: '/hr',
    visibleTo: ['owner'],
    children: [
      {
        items: [
          {
            id: 'hr.employees',
            labelAr: 'الموظفون',
            descAr: 'إدارة بيانات الموظفين',
            icon: Users,
            route: '/hr/employees',
          },
          {
            id: 'hr.salaries',
            labelAr: 'الرواتب',
            descAr: 'صرف الرواتب الشهرية',
            icon: DollarSign,
            route: '/hr/salaries',
          },
          {
            id: 'hr.adjustments',
            labelAr: 'التسويات',
            descAr: 'السُّلف والخصومات',
            icon: ArrowDownUp,
            route: '/hr/adjustments',
          },
        ],
      },
    ],
  },
  {
    id: 'settings',
    labelAr: 'الإعدادات',
    descAr: 'إعدادات النظام والمستخدمين',
    icon: SettingsIcon,
    route: '/settings',
    visibleTo: ['owner'],
  },
];

/* ---------- Helpers ---------- */

const SECTION_ROUTE_PREFIXES: Record<SectionId, string[]> = {
  home: ['/'],
  pos: ['/pos'],
  items: ['/items'],
  inventory: ['/inventory'],
  codes: ['/codes'],
  shipments: ['/shipments'],
  customers: ['/customers'],
  invoicesReturns: ['/invoices-returns', '/invoices', '/returns'],
  treasury: ['/treasury', '/cash', '/banks', '/expenses', '/reconcile'],
  reports: ['/reports'],
  hr: ['/hr'],
  settings: ['/settings'],
};

export function activeSectionForPath(pathname: string): SectionId {
  if (pathname === '/' || pathname === '') return 'home';
  for (const section of NAV) {
    const prefixes = SECTION_ROUTE_PREFIXES[section.id];
    for (const prefix of prefixes) {
      if (prefix === '/') continue;
      if (pathname === prefix || pathname.startsWith(prefix + '/')) return section.id;
    }
  }
  return 'home';
}

export function visibleNav(role: Role | undefined): NavTop[] {
  return NAV.filter((s) => !s.visibleTo || (role && s.visibleTo.includes(role))).map((section) => {
    if (!section.children) return section;
    const groups = section.children
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.visibleTo || (role && i.visibleTo.includes(role))),
      }))
      .filter((g) => g.items.length > 0);
    return { ...section, children: groups.length > 0 ? groups : undefined };
  });
}

/** Flat list of all reachable leaves (for the command palette). */
export function allLeaves(role: Role | undefined): NavLeaf[] {
  const out: NavLeaf[] = [];
  for (const section of visibleNav(role)) {
    // Treat the section itself as a navigable leaf as well — picking "الأصناف"
    // in ⌘K lands on /items hub.
    out.push({
      id: `${section.id}.root`,
      labelAr: section.labelAr,
      descAr: section.descAr,
      icon: section.icon,
      route: section.route,
    });
    if (section.children) {
      for (const group of section.children) {
        for (const leaf of group.items) out.push(leaf);
      }
    }
  }
  return out;
}

/** Resolve the breadcrumb-style page title for a given path. */
export function pageTitleForPath(pathname: string, role: Role | undefined): string | null {
  for (const section of visibleNav(role)) {
    if (section.children) {
      for (const group of section.children) {
        for (const leaf of group.items) {
          if (pathname === leaf.route || pathname.startsWith(leaf.route + '/')) {
            return leaf.labelAr;
          }
        }
      }
    }
    if (pathname === section.route) return section.labelAr;
  }
  // Detail routes that aren't direct leaves — fall back to the section label
  const section = activeSectionForPath(pathname);
  const found = NAV.find((s) => s.id === section);
  return found ? found.labelAr : null;
}
