/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        beige: {
          50: '#FAF8F5',
          100: '#F5F1E8',
          200: '#EDE4D5',
          300: '#E0D3BE',
          400: '#CEBFA4',
          500: '#BBAA8A',
          600: '#A49270',
          700: '#8A7858',
          800: '#6E5E43',
          900: '#524530',
        },
        sand: {
          50: '#F9F7F4',
          100: '#F0EBE3',
          200: '#E4DAD0',
          300: '#D5C6B7',
          400: '#C3AE99',
          500: '#AE9378',
          600: '#957860',
          700: '#7B604C',
          800: '#5E4938',
          900: '#443327',
        },
        mustard: {
          50: '#FEF9E7',
          100: '#FDF3D0',
          200: '#FBE9A0',
          300: '#F9DB6E',
          400: '#F7CC40',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
