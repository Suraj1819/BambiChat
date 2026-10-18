/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bambi: {
          primary: 'rgb(var(--bambi-primary) / <alpha-value>)',
          'primary-dark': 'rgb(var(--bambi-primary-dark) / <alpha-value>)',
          'primary-light': 'rgb(var(--bambi-primary-light) / <alpha-value>)',
          background: 'rgb(var(--bambi-background) / <alpha-value>)',
          surface: 'rgb(var(--bambi-surface) / <alpha-value>)',
          text: 'rgb(var(--bambi-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--bambi-text-secondary) / <alpha-value>)',
          border: 'rgb(var(--bambi-border) / <alpha-value>)',
          success: 'rgb(var(--bambi-success) / <alpha-value>)',
          error: 'rgb(var(--bambi-error) / <alpha-value>)',
        },
      },
      fontSize: {
        caption: ['12px', '16px'],
        body: ['14px', '20px'],
        label: ['13px', '18px'],
      },
    },
  },
  plugins: [],
};
