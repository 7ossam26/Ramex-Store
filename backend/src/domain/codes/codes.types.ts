export type CodeEntityName = 'grades' | 'colors' | 'compositions' | 'brands' | 'suppliers';

export const VALID_ENTITIES: CodeEntityName[] = [
  'grades', 'colors', 'compositions', 'brands', 'suppliers',
];

export type EntityConfig = {
  table: string;
  nameCol: string;
  rollsFkCol: string | null;
};

export const ENTITY_CONFIG: Record<CodeEntityName, EntityConfig> = {
  grades:       { table: 'fabric_grades', nameCol: 'arabic_name', rollsFkCol: 'grade_id'       },
  colors:       { table: 'colors',        nameCol: 'name_ar',     rollsFkCol: 'color_id'        },
  compositions: { table: 'compositions',  nameCol: 'arabic_name', rollsFkCol: 'composition_id'  },
  brands:       { table: 'brands',        nameCol: 'arabic_name', rollsFkCol: 'brand_id'        },
  suppliers:    { table: 'suppliers',     nameCol: 'arabic_name', rollsFkCol: null               },
};

export type Grade = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CodeColor = {
  id: number;
  name_ar: string;
  code: string;
  english_name: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CompositionBreakdownItem = { material: string; percent: number };

export type Composition = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  description: string | null;
  breakdown: CompositionBreakdownItem[] | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type Brand = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  product_line: string | null;
  supplier_id: number | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type Supplier = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  arabic_warning_text: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CodeRow = Grade | CodeColor | Composition | Brand | Supplier;
