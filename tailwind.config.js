/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./App.tsx', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nova: {
          ink: '#2C2825',
          cream: '#F8F6F1',
          paper: '#FFFDF9',
          sand: '#E9DFD1',
          gold: '#D7AA7A',
          clay: '#9B6E49',
          muted: '#958C83',
        },
      },
      fontFamily: { display: ['serif'] },
    },
  },
  plugins: [],
};
