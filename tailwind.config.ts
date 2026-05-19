import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pick: {
          green: "#16a34a",
          yellow: "#eab308",
          red: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
