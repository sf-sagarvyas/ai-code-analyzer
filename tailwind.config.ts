import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        severity: {
          critical: '#b91c1c',
          high: '#ea580c',
          medium: '#ca8a04',
          low: '#0284c7',
          info: '#475569',
        },
      },
    },
  },
  plugins: [],
};

export default config;
