import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/* Tokens live in `src/index.css` as HSL variables. Tailwind reads them via
 * `hsl(var(--token) / <alpha-value>)`. Source of truth: design-system/MASTER.md.
 * Spacing scale (4/8/12/16/20/24/32/40/48/64/80/96) and breakpoints (sm/md/lg/xl/2xl)
 * map cleanly onto Tailwind defaults — no extension needed. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },

      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '44px' }],
        '5xl': ['48px', { lineHeight: '52px' }],
      },

      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      colors: {
        /* ─── Legacy tokens (revalued to Warm Editorial in index.css) ──── */
        canvas: 'hsl(var(--color-canvas) / <alpha-value>)',
        ink: 'hsl(var(--color-ink) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--color-primary) / <alpha-value>)',
          foreground: 'hsl(var(--color-primary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--color-accent) / <alpha-value>)',
          foreground: 'hsl(var(--color-accent-foreground) / <alpha-value>)',
          /* Re-Skin Standard additions on the same accent namespace */
          hover: 'hsl(var(--rmx-accent-hover) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-accent-subtle) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--color-muted) / <alpha-value>)',
          foreground: 'hsl(var(--color-muted-foreground) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'hsl(var(--color-border) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-border-subtle) / <alpha-value>)',
          strong: 'hsl(var(--rmx-border-strong) / <alpha-value>)',
        },
        ring: 'hsl(var(--color-ring) / <alpha-value>)',

        /* ─── Re-Skin Standard tokens (Phase 2+ components consume these) ── */
        surface: {
          DEFAULT: 'hsl(var(--rmx-surface) / <alpha-value>)',
          elevated: 'hsl(var(--rmx-surface-elevated) / <alpha-value>)',
          'row-alt': 'hsl(var(--rmx-surface-row-alt) / <alpha-value>)',
          hover: 'hsl(var(--rmx-surface-hover) / <alpha-value>)',
          active: 'hsl(var(--rmx-surface-active) / <alpha-value>)',
        },
        chrome: {
          DEFAULT: 'hsl(var(--rmx-chrome) / <alpha-value>)',
          elevated: 'hsl(var(--rmx-chrome-elevated) / <alpha-value>)',
          text: 'hsl(var(--rmx-chrome-text) / <alpha-value>)',
          'text-muted': 'hsl(var(--rmx-chrome-text-muted) / <alpha-value>)',
          border: 'hsl(var(--rmx-chrome-border) / <alpha-value>)',
        },
        /* Text colors live under `foreground` to avoid clashing with Tailwind's `text-*` font-size prefix.
         * Usage: `text-foreground`, `text-foreground-muted`, `text-foreground-tertiary`. */
        foreground: {
          DEFAULT: 'hsl(var(--rmx-text-default) / <alpha-value>)',
          muted: 'hsl(var(--rmx-text-muted) / <alpha-value>)',
          tertiary: 'hsl(var(--rmx-text-tertiary) / <alpha-value>)',
          'on-accent': 'hsl(var(--rmx-text-on-accent) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--rmx-success) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-success-subtle) / <alpha-value>)',
          foreground: 'hsl(var(--rmx-success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--rmx-warning) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-warning-subtle) / <alpha-value>)',
          foreground: 'hsl(var(--rmx-warning-foreground) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'hsl(var(--rmx-danger) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-danger-subtle) / <alpha-value>)',
          foreground: 'hsl(var(--rmx-danger-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--rmx-info) / <alpha-value>)',
          subtle: 'hsl(var(--rmx-info-subtle) / <alpha-value>)',
          foreground: 'hsl(var(--rmx-info-foreground) / <alpha-value>)',
        },

        /* Cool Techy palette — consumed by Login; available system-wide */
        techy: {
          bg: 'hsl(var(--rmx-techy-bg) / <alpha-value>)',
          ink: 'hsl(var(--rmx-techy-ink) / <alpha-value>)',
          accent: 'hsl(var(--rmx-techy-accent) / <alpha-value>)',
          'accent-hover': 'hsl(var(--rmx-techy-accent-hover) / <alpha-value>)',
          border: 'hsl(var(--rmx-techy-border) / <alpha-value>)',
          surface: 'hsl(var(--rmx-techy-surface) / <alpha-value>)',
        },
      },

      borderRadius: {
        DEFAULT: '8px',  // legacy `rounded` class
        tight: '4px',    // legacy alias
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        pill: '9999px',
      },

      boxShadow: {
        xs: '0 1px 2px 0 hsl(220 32% 15% / 0.04)',
        sm: '0 1px 3px 0 hsl(220 32% 15% / 0.08), 0 1px 2px -1px hsl(220 32% 15% / 0.06)',
        md: '0 4px 6px -1px hsl(220 32% 15% / 0.08), 0 2px 4px -2px hsl(220 32% 15% / 0.06)',
        lg: '0 10px 15px -3px hsl(220 32% 15% / 0.10), 0 4px 6px -4px hsl(220 32% 15% / 0.06)',
        xl: '0 20px 25px -5px hsl(220 32% 15% / 0.12), 0 8px 10px -6px hsl(220 32% 15% / 0.06)',
      },

      transitionDuration: {
        '75': '75ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
        accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
        emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
      },

      zIndex: {
        base: '0',
        dropdown: '1000',
        sticky: '1100',
        overlay: '1200',
        modal: '1300',
        popover: '1400',
        toast: '1500',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
