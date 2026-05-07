import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../src/pages/Login';
import { AuthProvider } from '../src/lib/auth';

describe('LoginPage', () => {
  it('renders Arabic strings and form fields', () => {
    document.documentElement.dir = 'rtl';
    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>,
    );
    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم المستخدم')).toBeInTheDocument();
    expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});
