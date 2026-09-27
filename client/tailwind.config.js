/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand = redwood (portal & marketing share one accent system)
        brand: {
          50:  '#fdf2f0',
          100: '#fadcd6',
          200: '#f3b5a8',
          300: '#e8866f',
          400: '#d95e3f',
          500: '#c44424',
          600: '#a8341a',
          700: '#7e2614',
          800: '#5a1c10',
          900: '#3d130b',
        },
        redwood: {
          50:  '#fdf2f0',
          100: '#fadcd6',
          200: '#f3b5a8',
          300: '#e8866f',
          400: '#d95e3f',
          500: '#c44424',
          600: '#a8341a',
          700: '#7e2614',
          800: '#5a1c10',
          900: '#3d130b',
        },
        forest: {
          50:  '#eaf5ee',
          100: '#cce5d3',
          200: '#a3d2af',
          300: '#74b985',
          400: '#4d9b62',
          500: '#33824a',
          600: '#266839',
          700: '#1e522d',
          800: '#173f23',
          900: '#102d19',
        },
        cream: '#f7f0e3',
        // App background: warm off-white that sits between white cards and cream
        canvas: '#faf8f5',
        // Neutrals are warm stone everywhere (so every gray-* utility matches the
        // cream/redwood brand instead of cool blue-grey)
        gray: {
          50:  '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 1px rgba(28, 25, 23, 0.03)',
        pop: '0 12px 32px -8px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      }
    }
  },
  plugins: []
}
