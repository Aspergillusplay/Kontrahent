/** @type {import('tailwindcss').Config} */
const slateThemeColors = {
  50: 'rgb(var(--slate-50) / <alpha-value>)',
  100: 'rgb(var(--slate-100) / <alpha-value>)',
  200: 'rgb(var(--slate-200) / <alpha-value>)',
  300: 'rgb(var(--slate-300) / <alpha-value>)',
  400: 'rgb(var(--slate-400) / <alpha-value>)',
  500: 'rgb(var(--slate-500) / <alpha-value>)',
  600: 'rgb(var(--slate-600) / <alpha-value>)',
  700: 'rgb(var(--slate-700) / <alpha-value>)',
  800: 'rgb(var(--slate-800) / <alpha-value>)',
  850: 'rgb(var(--slate-850) / <alpha-value>)',
  900: 'rgb(var(--slate-900) / <alpha-value>)',
  950: 'rgb(var(--slate-950) / <alpha-value>)',
};

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        slate: slateThemeColors,
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
  plugins: [],
};
