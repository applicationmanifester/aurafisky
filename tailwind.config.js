/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./app.js",
    "./styles.css",
    "./modules/**/*.js",
    "./src/**/*.js",
    "./features/**/*.js",
    "./workers/**/*.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        primary: { DEFAULT: "#14b8a6", light: "#2dd4bf", dark: "#0d9488" },
        surface: { light: "#f8fafc", dark: "#0f172a" },
      },
    },
  },
  plugins: [],
};
