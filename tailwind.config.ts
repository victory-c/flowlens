import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16213a",
        panel: "#f7f8fb",
        line: "#d9deea",
        ocean: "#2364aa",
        mint: "#2a9d8f",
        coral: "#e76f51",
        gold: "#e9c46a"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(22, 33, 58, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
