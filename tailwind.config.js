/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        slate: {
          50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1',
          400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c',
          800: '#292827', 900: '#1f1f1d', 950: '#161615',
        },
        cyan: {
          50: '#f4f7ed', 100: '#e7edd9', 200: '#d1ddba', 300: '#b3c78f',
          400: '#91ad63', 500: '#739149', 600: '#5c7639', 700: '#485c2f',
          800: '#3b4a29', 900: '#333f25', 950: '#192111',
        },
        chess: {
          dark: '#262421',
          light: '#f0d9b5',
          highlight: 'rgba(255, 255, 0, 0.5)',
        },
      },
    },
  },
  plugins: [],
};
