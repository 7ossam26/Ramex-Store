import axios from 'axios';
import { ar } from '@/i18n/ar';

interface ZodIssue {
  code?: string;
  message: string;
  path?: (string | number)[];
}

interface ApiErrorData {
  error?: string;
  message?: string;
  issues?: ZodIssue[];
}

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Map a Zod issue to a clear Arabic sentence. If the message is already Arabic
 *  (authored intentionally on the schema), pass it through. Otherwise translate by
 *  Zod's stable issue code so end-users never see raw English jargon like
 *  "Invalid enum value. Expected 'read' | 'write' | 'approve'…". */
function translateZodIssue(issue: ZodIssue): string {
  if (issue.message && hasArabic(issue.message)) return issue.message;
  switch (issue.code) {
    case 'invalid_enum_value':  return 'قيمة غير مسموح بها';
    case 'invalid_type':        return 'نوع البيانات غير صحيح';
    case 'too_small':           return 'القيمة أقل من الحد المطلوب';
    case 'too_big':             return 'القيمة أكبر من الحد المسموح';
    case 'invalid_string':      return 'صيغة غير صحيحة';
    case 'unrecognized_keys':   return 'بيانات إضافية غير مطلوبة';
    case 'invalid_date':        return 'تاريخ غير صالح';
    case 'not_multiple_of':     return 'القيمة لا تطابق المضاعفات المطلوبة';
    default:                    return 'بيانات غير صحيحة';
  }
}

export function extractApiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ApiErrorData | undefined;
    if (data?.error === 'validation' && Array.isArray(data.issues) && data.issues.length > 0) {
      // De-duplicate so the user doesn't see "بيانات غير صحيحة، بيانات غير صحيحة" stacked.
      const unique = Array.from(new Set(data.issues.map(translateZodIssue)));
      return unique.join('، ');
    }
    if (data?.message) return data.message;
    if (data?.error && ar.common.apiErrors[data.error]) return ar.common.apiErrors[data.error];
    if (data?.error) return data.error;
  }
  if (e instanceof Error) return e.message;
  return ar.common.error;
}
