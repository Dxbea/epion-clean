/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './public/index.html',              // <-- ajoute ça (sans gravité si absent)
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Thermal-variable',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Inter',
          'Apple Color Emoji',
          'Segoe UI Emoji'
        ]
      },
      colors: {
        brand: {
          white: '#FAFAF5',
          black: '#000000',
          blue: '#2563EB',
          blueDeep: '#1D4ED8',
          lightBlue: '#85CCFF',
          indigo: '#222C66',
        },
        surface: {
          50: '#FAFAF5',
          100: '#F1F1EA',
          200: '#E7E7DE',
          900: '#0B0B0A',
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.06)'
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
    }
  },
  plugins: [],
}
