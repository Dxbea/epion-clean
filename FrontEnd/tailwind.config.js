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
          'Roboto',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Inter',
          'Apple Color Emoji',
          'Segoe UI Emoji'
        ],
        display: [
          'Thermal-variable',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'sans-serif',
        ],
        serif: [
          'Thermal-variable',
          'ui-serif',
          'Georgia',
          'serif'
        ],
      },
      colors: {
        brand: {
          white: '#FAFAF5',
          black: '#0B0B0A',
          turquoise: '#38A6A6',
          turquoiseLight: '#58C6C6',
          cyan: '#78DCE3',
          lime: '#CBEA62',
          limeLight: '#B7E87C',
          // Legacy aliases: retain current call sites while using the Epion accent.
          blue: '#38A6A6',
          blueDeep: '#2C8585',
          lightBlue: '#78DCE3',
          indigo: '#0B0B0A',
        },
        epion: {
          ivory: '#FAFAF5',
          ink: '#0B0B0A',
          turquoise: '#38A6A6',
          cyan: '#78DCE3',
          lime: '#CBEA62',
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
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
