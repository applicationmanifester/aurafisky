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
        primary: { DEFAULT: "#6366f1", light: "#818cf8", dark: "#4f46e5" },
        surface: { light: "#f8fafc", dark: "#0f172a" },
      },
    },
  },
  plugins: [],
};
