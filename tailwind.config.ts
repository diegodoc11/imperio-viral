import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tier colors — bordes y badges
        tier: {
          good: "#10b981",     // emerald-500
          viral: "#f59e0b",    // amber-500 (bronze)
          gem: "#94a3b8",      // slate-400 (silver)
          diamond: "#fcd34d",  // amber-300 (gold)
          unicorn: "#a855f7",  // purple-500
        },
      },
    },
  },
  plugins: [],
};

export default config;
