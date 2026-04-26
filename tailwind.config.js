/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary neutrals — warm dark tones for text
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
        // Page backgrounds and card surfaces
        beige: {
          50: '#FDFCFA',
          100: '#F8F5F1',
          200: '#F0EAE2',
          300: '#E7DED4',
          400: '#DCD4C8',  // page background
          500: '#CFC6B8',
          600: '#C6BDA0',  // arena — borders/dividers
          700: '#A8A088',
          800: '#8A8370',
          900: '#6B6658',
        },
        // Primary accent — amarillo patito
        mustard: {
          50: '#FDF8EE',
          100: '#FAF0D7',
          200: '#F5E3B3',
          300: '#F0D59F',
          400: '#E7C78A',  // base amarillo — primary buttons
          500: '#D9B978',  // hover state
          600: '#C8A460',
          700: '#AC894A',
          800: '#876B38',
          900: '#624E28',
        },
        // Verde musgo — secondary text, captions
        musgo: {
          50: '#F4F4F1',
          100: '#E6E6E0',
          200: '#CCCDC4',
          300: '#ADADAA',
          400: '#969783',
          500: '#818267',  // base
          600: '#6D6E57',
          700: '#585945',
          800: '#434434',
          900: '#2F302A',
        },
        // Rojo tierra — accent text, links
        rojo: {
          50: '#F9F0EC',
          100: '#F2DACE',
          200: '#E4B9A4',
          300: '#CE9177',
          400: '#B87055',
          500: '#A35C3D',  // base
          600: '#8B4A30',
          700: '#713924',
          800: '#572B1B',
          900: '#3D1E12',
        },
        // Rosa polvo — special mood cards (use sparingly)
        rosa: {
          50: '#FCF9FA',
          100: '#F5EEEF',
          200: '#EADBDD',  // base — calm/sleep content
          300: '#D9C2C5',
          400: '#C4A5A9',
          500: '#AD898E',
          600: '#8F6E73',
          700: '#735659',
          800: '#563F42',
          900: '#3B2B2E',
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
