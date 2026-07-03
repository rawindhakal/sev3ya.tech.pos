import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5f7',
          100: '#ffe3ea',
          200: '#ffc2d1',
          300: '#ff8fac',
          400: '#f55d85',
          500: '#e23368',
          600: '#c41f54',
          700: '#a01646',
          800: '#84153e',
          900: '#6f1638',
        },
      },
    },
  },
  plugins: [],
};

export default config;
