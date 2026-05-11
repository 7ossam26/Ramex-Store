import { api } from './api';
import type { RollWithDetails, RollWithLabelDetails } from './items-types';

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

  getRollDetail: (rollId: number) =>
    api.get<RollWithLabelDetails>(`/rolls/${rollId}`).then((r) => r.data),

  labelPdfUrl: (rollId: number) => `/api/rolls/${rollId}/label-pdf`,

  fabricLabelUrl: (rollId: number, format: 'thermal' | 'a4' = 'thermal') =>
    `/api/rolls/${rollId}/fabric-label?format=${format}`,

  reprintLabel: (rollId: number, reason: string) =>
    api
      .post<Blob>(`/rolls/${rollId}/reprint-label`, { reason }, { responseType: 'blob' })
      .then((r) => r.data),

  batchLabelsPdf: (rollIds: number[]) =>
    api
      .post<Blob>('/rolls/labels-batch', { rollIds }, { responseType: 'blob' })
      .then((r) => r.data),

  batchFabricLabels: (rollIds: number[], format: 'thermal' | 'a4', perPage = 24) =>
    api
      .post<Blob>('/rolls/fabric-labels/batch', { rollIds, format, perPage }, { responseType: 'blob' })
      .then((r) => r.data),
};
