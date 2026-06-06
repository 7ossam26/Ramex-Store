import { api } from './api';

export type CodeGrade = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type CodeComposition = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  description: string | null;
  breakdown: Array<{ material: string; percent: number }> | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type CodeBrand = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  product_line: string | null;
  supplier_id: number | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type CodeSupplier = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  arabic_warning_text: string | null;
  phone: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type CodeColor = {
  id: number;
  name_ar: string;
  code: string;
  english_name: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type RollReference = {
  id: number;
  internal_barcode: string;
  status: string;
  fabric_name: string;
  color_name: string;
};

type ActiveFilter = 'active' | 'inactive' | 'all';

async function listEntity<T>(entity: string, activeOnly = true): Promise<T[]> {
  const params = activeOnly ? { active: 'true' } : undefined;
  const { data } = await api.get<T[]>(`/codes/${entity}`, { params });
  return data;
}

async function listEntityFiltered<T>(entity: string, filter: ActiveFilter): Promise<T[]> {
  const params =
    filter === 'active'   ? { active: 'true'  } :
    filter === 'inactive' ? { active: 'false' } :
                            { active: 'all'   };
  const { data } = await api.get<T[]>(`/codes/${entity}`, { params });
  return data;
}

export const codesApi = {
  // Dropdown-use (active only)
  listGrades:       () => listEntity<CodeGrade>('grades'),
  listCompositions: () => listEntity<CodeComposition>('compositions'),
  listBrands:       () => listEntity<CodeBrand>('brands'),
  listSuppliers:    () => listEntity<CodeSupplier>('suppliers'),
  listCodeColors:   () => listEntity<CodeColor>('colors'),

  // Management (all including inactive, with usage_count)
  listAllGrades:       () => listEntity<CodeGrade>('grades', false),
  listAllCompositions: () => listEntity<CodeComposition>('compositions', false),
  listAllBrands:       () => listEntity<CodeBrand>('brands', false),
  listAllSuppliers:    () => listEntity<CodeSupplier>('suppliers', false),
  listAllColors:       () => listEntity<CodeColor>('colors', false),

  // Management page (filter by active/inactive/all)
  listGradesFiltered:       (f: ActiveFilter) => listEntityFiltered<CodeGrade>('grades', f),
  listColorsFiltered:       (f: ActiveFilter) => listEntityFiltered<CodeColor>('colors', f),
  listCompositionsFiltered: (f: ActiveFilter) => listEntityFiltered<CodeComposition>('compositions', f),
  listBrandsFiltered:       (f: ActiveFilter) => listEntityFiltered<CodeBrand>('brands', f),
  listSuppliersFiltered:    (f: ActiveFilter) => listEntityFiltered<CodeSupplier>('suppliers', f),

  // References (rolls using this code)
  getReferences: (entity: string, id: number) =>
    api.get<RollReference[]>(`/codes/${entity}/${id}/references`).then((r) => r.data),

  create: (entity: string, data: Record<string, unknown>) =>
    api.post(`/codes/${entity}`, data).then((r) => r.data),

  update: (entity: string, id: number, data: Record<string, unknown>) =>
    api.patch(`/codes/${entity}/${id}`, data).then((r) => r.data),

  deactivate: (entity: string, id: number, force = false) =>
    api.delete(`/codes/${entity}/${id}`, { data: force ? { force: true } : {} }).then((r) => r.data),

  restore: (entity: string, id: number) =>
    api.post(`/codes/${entity}/${id}/restore`).then((r) => r.data),
};
