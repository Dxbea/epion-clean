// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html','./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          white:  '#FAFAF5',
          black:  '#111111',
          gray:   '#EDEDED',
          turquoise:       '#38A6A6',
          turquoiseLight:  '#58C6C6',
          cyan:            '#78DCE3',
          lime:            '#CBEA62',
          limeLight:       '#B7E87C',
        },
      },
      backgroundImage: {
        'epion': 'linear-gradient(135deg,#38A6A6 0%,#78DCE3 40%,#CBEA62 100%)',
      },
      boxShadow: {
        soft: '0 6px 20px rgba(0,0,0,.08)'
      }
    },
  },
  plugins: [],
} satisfies Config
