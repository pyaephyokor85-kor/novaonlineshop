/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./App.tsx', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nova: {
          ink: '#102B62',
          cream: '#FBF7EF',
          paper: '#FFFDF9',
          sand: '#F0E7D4',
          gold: '#D8B768',
          clay: '#946D25',
          muted: '#958C83',
        },
      },
      fontFamily: { display: ['serif'] },
    },
  },
  plugins: [],
};
