import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const Schema = z.object({ username: z.string().min(1), password: z.string().min(1) });
type FormVals = z.infer<typeof Schema>;

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormVals>({ resolver: zodResolver(Schema) });

  const onSubmit = async (v: FormVals) => {
    setErr(null);
    try {
      await login(v.username, v.password);
      nav('/');
    } catch {
      setErr(ar.login.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ar.login.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{ar.login.username}</Label>
              <Input id="username" autoFocus {...register('username')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{ar.login.password}</Label>
              <Input id="password" type="password" {...register('password')} />
            </div>
            {err && <p className="text-sm text-danger" role="alert">{err}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {ar.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
