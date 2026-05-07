import { api } from './api';
import type { RollWithDetails } from './items-types';

export const itemsApi = {
  searchRolls: (params: {
    fabric?: string;
    color?: string;
    rollSrNo?: string;
    barcodePartial?: string;
  }) =>
    api
      .get<RollWithDetails[]>('/rolls/search', { params })
      .then((r) => r.data),

  labelPdfUrl: (rollId: number) => `/api/rolls/${rollId}/label-pdf`,

  reprintLabel: (rollId: number, reason: string) =>
    api
      .post<Blob>(`/rolls/${rollId}/reprint-label`, { reason }, { responseType: 'blob' })
      .then((r) => r.data),

  batchLabelsPdf: (rollIds: number[]) =>
    api
      .post<Blob>('/rolls/labels-batch', { rollIds }, { responseType: 'blob' })
      .then((r) => r.data),
};
