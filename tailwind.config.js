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
          50: '#FBF6E9',
          100: '#F5EBD0',
          200: '#EDD8A4',
          300: '#E2C275',
          400: '#D4AA52',
          500: '#C49438',
          600: '#A87A28',
          700: '#8A611C',
          800: '#6E4C14',
          900: '#52390E',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
