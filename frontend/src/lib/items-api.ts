import { api } from './api';
import type { RollWithDetails, RollWithLabelDetails } from './items-types';
import type { RollStatus } from './inventory-types';

export const itemsApi = {
  searchRolls: (params: {
    fabric?: string;
    color?: string;
    rollSrNo?: string;
    barcodePartial?: string;
    warehouse?: string;
  }) =>
    api
      .get<RollWithDetails[]>('/rolls/search', { params })
      .then((r) => r.data),

  getRollDetail: (rollId: number) =>
    api.get<RollWithLabelDetails>(`/rolls/${rollId}`).then((r) => r.data),

  labelPdfBlob: (rollId: number) =>
    api
      .get<Blob>(`/rolls/${rollId}/label-pdf`, { responseType: 'blob' })
      .then((r) => r.data),

  fabricLabelBlob: (rollId: number, format: 'thermal' | 'a4' = 'thermal') =>
    api
      .get<Blob>(`/rolls/${rollId}/fabric-label`, { params: { format }, responseType: 'blob' })
      .then((r) => r.data),

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

  updateRoll: (rollId: number, data: { status?: RollStatus; is_visible_at_pos?: boolean }) =>
    api.patch<RollWithDetails>(`/rolls/${rollId}`, data).then((r) => r.data),

  returnRollToFactory: (rollId: number) =>
    api.post<RollWithDetails>(`/rolls/${rollId}/return-to-factory`).then((r) => r.data),
};
