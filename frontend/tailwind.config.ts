import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brenne: {
          50: '#f3f7f0',
          100: '#e4efe0',
          200: '#cbdfc2',
          300: '#a7c997',
          400: '#7fad6a',
          500: '#5b8f44',
          600: '#457233',
          700: '#365928',
          800: '#2d5016',
          900: '#1b320d',
          950: '#0e1c07',
        },
        creuse: {
          50: '#f0f7fb',
          100: '#ddedf7',
          200: '#c1def0',
          300: '#97c7e5',
          400: '#66a9d6',
          500: '#428ec4',
          600: '#2f72a9',
          700: '#265c8a',
          800: '#1e5a8e',
          900: '#1b3f63',
          950: '#11273f',
        },
        sable: {
          50: '#faf8f5',
          100: '#f5f0e6',
          200: '#ebdcc8',
          300: '#dec4a4',
          400: '#cca67c',
          500: '#be8d5d',
          600: '#b0794e',
          700: '#92613f',
          800: '#775037',
          900: '#61432f',
          950: '#352318',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
