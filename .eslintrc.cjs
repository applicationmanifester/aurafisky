module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["html"],
  overrides: [
    {
      files: ["*.html"],
      processor: "html/html",
    },
  ],
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "prefer-const": "error",
    eqeqeq: ["error", "always"],
    "no-var": "error",
    "vars-on-top": "error",
    "no-undef": "error",
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
