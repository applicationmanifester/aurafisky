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
  globals: {
    WeatherService: "readonly",
    localforage: "readonly",
    L: "readonly",
    DOMPurify: "readonly",
    firebase: "readonly",
    module: "readonly",
    exports: "readonly",
    IconSystem: "readonly",
    WeatherIcons: "readonly",
  },
  overrides: [
    {
      files: ["sw.js"],
      env: {
        serviceworker: true,
      },
      globals: {
        localforage: "readonly",
        WeatherService: "readonly",
      },
    },
    {
      files: [
        "tailwind.config.js",
        ".eslintrc.cjs",
        "push-sender/functions/**/*.js",
      ],
      env: {
        node: true,
      },
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
