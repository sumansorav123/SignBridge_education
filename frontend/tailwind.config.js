/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Sora"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f6f8fb',
          100: '#eaeff7',
          200: '#d3deec',
          300: '#aec3da',
          400: '#809fc4',
          500: '#5f81aa',
          600: '#4a678d',
          700: '#3d5372',
          800: '#35465f',
          900: '#0f1b2d',
          950: '#080f1c',
        },
        brand: {
          50: '#eefbfb',
          100: '#d5f5f4',
          200: '#aee9e9',
          300: '#79d8d9',
          400: '#43bfc3',
          500: '#26a3a8',
          600: '#1b8288',
          700: '#19686e',
          800: '#19545a',
          900: '#19464b',
          950: '#08292d',
        },
        violet: {
          50: '#f3f1ff',
          100: '#e9e5ff',
          200: '#d5ceff',
          300: '#b7a8ff',
          400: '#9477fd',
          500: '#7c4df5',
          600: '#6c2de8',
          700: '#5c1fcc',
          800: '#4c1ba6',
          900: '#401a86',
          950: '#270e5c',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(38,163,168,.16), 0 18px 60px -24px rgba(38,163,168,.55)',
        soft: '0 20px 50px -30px rgba(15,27,45,.45)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(.9)', opacity: '.7' },
          '80%, 100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulseRing 2.2s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
    },
  },
  plugins: [],
}
