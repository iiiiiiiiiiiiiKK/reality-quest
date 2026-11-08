/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'var(--ink-950)',
          900: 'var(--ink-900)',
          850: 'var(--ink-850)',
          800: 'var(--ink-800)',
          700: 'var(--ink-700)',
          600: 'var(--ink-600)',
          500: 'var(--ink-500)',
        },
        chalk: {
          50: 'var(--chalk-50)',
          100: 'var(--chalk-100)',
          300: 'var(--chalk-300)',
          500: 'var(--chalk-500)',
        },
        signal: {
          DEFAULT: 'var(--signal)',
          soft: 'var(--signal-soft)',
          glow: 'var(--signal-glow)',
        },
        accent: {
          city: 'var(--accent-city)',
          nature: 'var(--accent-nature)',
          culture: 'var(--accent-culture)',
          photo: 'var(--accent-photo)',
          random: 'var(--accent-random)',
        },
        easy: 'var(--diff-easy)',
        normal: 'var(--diff-normal)',
        hard: 'var(--diff-hard)',
        epic: 'var(--diff-epic)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Segoe UI"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', '"Segoe UI"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 18px 60px -24px rgba(0,0,0,.72)',
        marker: '0 0 0 2px rgba(0,0,0,.55), 0 6px 22px -6px currentColor',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pulseRing: {
          '0%': { transform: 'scale(.72)', opacity: '.85' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        sheen: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        badgePop: {
          '0%': { transform: 'scale(.5) rotate(-14deg)', opacity: '0' },
          '60%': { transform: 'scale(1.08) rotate(3deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
      },
      animation: {
        rise: 'rise .38s cubic-bezier(.22,.9,.24,1) both',
        fade: 'fade .3s ease both',
        pulseRing: 'pulseRing 2.4s cubic-bezier(.24,.7,.3,1) infinite',
        sheen: 'sheen 1.6s linear infinite',
        badgePop: 'badgePop .55s cubic-bezier(.2,1.3,.3,1) both',
      },
    },
  },
  plugins: [],
};
