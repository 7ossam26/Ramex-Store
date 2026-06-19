import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error';

const inputBase =
  'flex h-11 w-full rounded border border-[hsl(var(--rmx-techy-border))] bg-[hsl(var(--rmx-techy-surface))] px-3 py-2 text-sm text-[hsl(var(--rmx-techy-ink))] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rmx-techy-accent))] focus-visible:ring-offset-1 disabled:opacity-50';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { updateAuth } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: User }>(
        '/auth/change-password',
        { currentPassword, newPassword },
      );
      // Swap to fresh token without logging out — stays inside the system
      updateAuth(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = extractApiError(err);
      setError(msg === 'INVALID_CREDENTIALS' ? 'كلمة المرور الحالية غير صحيحة' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4 bg-[hsl(var(--rmx-techy-bg))]"
    >
      <div className="w-full max-w-[420px] rounded-lg border border-[hsl(var(--rmx-techy-border))] bg-[hsl(var(--rmx-techy-surface))] p-8 shadow-lg space-y-6">
        <div>
          <h1
            className="text-xl font-semibold mb-1"
            style={{ color: 'hsl(var(--rmx-techy-ink))' } as CSSProperties}
          >
            تغيير كلمة المرور
          </h1>
          <p
            className="text-sm"
            style={{ color: 'hsl(var(--rmx-techy-ink) / 0.55)' } as CSSProperties}
          >
            يجب عليك تغيير كلمة المرور قبل المتابعة
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="current-password"
              className="block text-sm"
              style={{ color: 'hsl(var(--rmx-techy-ink) / 0.6)' } as CSSProperties}
            >
              كلمة المرور الحالية
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className={inputBase}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="new-password"
              className="block text-sm"
              style={{ color: 'hsl(var(--rmx-techy-ink) / 0.6)' } as CSSProperties}
            >
              كلمة المرور الجديدة
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputBase}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="confirm-password"
              className="block text-sm"
              style={{ color: 'hsl(var(--rmx-techy-ink) / 0.6)' } as CSSProperties}
            >
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              className={inputBase}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded px-4 text-sm font-medium text-white transition-colors duration-150 active:opacity-90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rmx-techy-accent))] focus-visible:ring-offset-2 bg-[hsl(var(--rmx-techy-accent))] hover:bg-[hsl(var(--rmx-techy-accent-hover))]"
          >
            {loading ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور والمتابعة'}
          </button>
        </form>
      </div>
    </div>
  );
}
