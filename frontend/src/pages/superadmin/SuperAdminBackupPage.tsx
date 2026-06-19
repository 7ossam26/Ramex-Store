import { useState } from 'react';
import { Download, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { superadminApi } from '@/lib/superadmin-api';

const LAST_BACKUP_KEY = 'ramex_last_backup_at';

export function SuperAdminBackupPage() {
  const [lastBackup, setLastBackup] = useState<string | null>(() => {
    return localStorage.getItem(LAST_BACKUP_KEY);
  });

  function handleDownload() {
    const url = superadminApi.getBackupUrl();
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const now = new Date().toISOString();
    localStorage.setItem(LAST_BACKUP_KEY, now);
    setLastBackup(now);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">النسخ الاحتياطي</h1>
        <p className="text-sm text-foreground-muted">تنزيل نسخة احتياطية كاملة من قاعدة البيانات</p>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-amber-800">
          <AlertTriangle className="size-5 shrink-0" />
          معلومات النسخ الاحتياطي
        </div>
        <ul className="text-sm text-amber-700 space-y-1.5 list-disc list-inside">
          <li>تشمل النسخة الاحتياطية جميع البيانات بما فيها المستخدمون وكلمات المرور المشفرة</li>
          <li>صيغة الملف: PostgreSQL custom dump (.dump)</li>
          <li>لاستعادة النسخة: <code className="font-mono text-xs bg-amber-100 px-1 rounded">pg_restore</code></li>
          <li>احتفظ بالنسخة في مكان آمن — تحتوي على بيانات حساسة</li>
        </ul>
      </div>

      {/* Last backup info */}
      {lastBackup && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Clock className="size-4" />
          آخر نسخة احتياطية: {new Date(lastBackup).toLocaleString('ar-EG')}
        </div>
      )}

      {/* Download button */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-foreground">تنزيل نسخة احتياطية الآن</h2>
          <p className="text-sm text-foreground-muted">
            سيبدأ تنزيل ملف <code className="font-mono text-xs">.dump</code> فور الضغط
          </p>
        </div>
        <Button
          onClick={handleDownload}
          className="gap-2 bg-amber-700 hover:bg-amber-800 text-white"
        >
          <Download className="size-4" />
          تنزيل نسخة احتياطية
        </Button>
      </div>
    </div>
  );
}
