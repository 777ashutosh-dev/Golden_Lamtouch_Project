/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#FFC107",
        "background-light": "#f6f7f8",
        "background-dark": "#1A1A1A",
        "surface-dark": "#2C2C2C",
        "border-dark": "#3e3e3e"
      },
      fontFamily: {
        // UPDATED: Switched from 'Inter' to 'Rajdhani' for the industrial vibe
        "display": ["Rajdhani", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}