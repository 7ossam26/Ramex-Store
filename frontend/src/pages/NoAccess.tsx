import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NoAccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4" dir="rtl">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
        <ShieldOff className="w-10 h-10 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">غير مصرح</h1>
        <p className="text-muted-foreground max-w-sm">
          ليس لديك صلاحية للوصول إلى هذه الصفحة. تواصل مع المسؤول لمنحك الأذونات اللازمة.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">العودة للرئيسية</Link>
      </Button>
    </div>
  );
}
