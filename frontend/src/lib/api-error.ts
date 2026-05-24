import axios from 'axios';
import { ar } from '@/i18n/ar';

interface ZodIssue {
  message: string;
  path?: (string | number)[];
}

interface ApiErrorData {
  error?: string;
  message?: string;
  issues?: ZodIssue[];
}

export function extractApiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ApiErrorData | undefined;
    if (data?.error === 'validation' && Array.isArray(data.issues) && data.issues.length > 0) {
      return data.issues.map((i) => i.message).join('، ');
    }
    if (data?.message) return data.message;
    if (data?.error && ar.common.apiErrors[data.error]) return ar.common.apiErrors[data.error];
    if (data?.error) return data.error;
  }
  if (e instanceof Error) return e.message;
  return ar.common.error;
}
