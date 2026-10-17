/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Bambi design tokens
        bambi: {
          primary: '#6D4AFF',
          'primary-dark': '#4930C7',
          'primary-light': '#F0ECFF',
          background: '#F7F7FB',
          surface: '#FFFFFF',
          text: '#191923',
          'text-secondary': '#777786',
          border: '#E7E5EF',
          success: '#16865B',
          error: '#D83B4B',
          warning: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'heading-1': ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        'heading-2': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'heading-3': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
        label: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '500' }],
      },
      borderRadius: {
        'bambi-sm': '0.375rem',
        'bambi': '0.625rem',
        'bambi-lg': '0.875rem',
        'bambi-xl': '1.25rem',
      },
      boxShadow: {
        'bambi-sm': '0 1px 2px 0 rgb(25 25 35 / 0.04)',
        'bambi': '0 2px 8px 0 rgb(25 25 35 / 0.06)',
        'bambi-lg': '0 8px 24px 0 rgb(25 25 35 / 0.08)',
      },
      spacing: {
        sidebar: '22rem',
        'sidebar-sm': '18rem',
      },
      maxWidth: {
        conversation: '48rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
