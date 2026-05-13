import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useState, type CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';

const Schema = z.object({ username: z.string().min(1), password: z.string().min(1) });
type FormVals = z.infer<typeof Schema>;

/* Arbitrary-value class strings — scanned directly from this file by Tailwind JIT.
 * Colors reference CSS custom properties from index.css so no config restart is needed. */
const inputBase =
  'flex h-11 w-full rounded border border-[hsl(var(--rmx-techy-border))] bg-[hsl(var(--rmx-techy-surface))] px-3 py-2 text-sm text-[hsl(var(--rmx-techy-ink))] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rmx-techy-accent))] focus-visible:ring-offset-1 disabled:opacity-50';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4 bg-[hsl(var(--rmx-techy-bg))]"
    >
      {/* Floating card */}
      <div className="w-full max-w-[420px] rounded-lg border border-[hsl(var(--rmx-techy-border))] bg-[hsl(var(--rmx-techy-surface))] p-8 shadow-lg">
        <h1
          className="mb-7 text-xl font-semibold"
          style={{ color: 'hsl(var(--rmx-techy-ink))' }}
        >
          {ar.login.title}
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-sm"
              style={{ color: 'hsl(var(--rmx-techy-ink) / 0.6)' }}
            >
              {ar.login.username}
            </label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              className={inputBase}
              {...register('username')}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-sm"
              style={{ color: 'hsl(var(--rmx-techy-ink) / 0.6)' }}
            >
              {ar.login.password}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`${inputBase} pe-10`}
                {...register('password')}
              />
              {/* Toggle on leading edge — in RTL that is the visual LEFT (inline-end) */}
              <button
                type="button"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                onClick={() => setShowPassword((p) => !p)}
                className="absolute inset-y-0 end-0 flex items-center pe-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rmx-techy-accent))] focus-visible:ring-offset-1 rounded"
                style={{ color: 'hsl(var(--rmx-techy-ink) / 0.4)' } as CSSProperties}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'hsl(var(--rmx-techy-ink) / 0.7)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--rmx-techy-ink) / 0.4)')}
              >
                {showPassword
                  ? <EyeOff size={16} aria-hidden="true" />
                  : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {err && (
            <p className="text-sm text-danger" role="alert">
              {err}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center rounded px-4 text-sm font-medium text-white transition-colors duration-150 active:opacity-90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rmx-techy-accent))] focus-visible:ring-offset-2 bg-[hsl(var(--rmx-techy-accent))] hover:bg-[hsl(var(--rmx-techy-accent-hover))]"
          >
            {ar.login.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
