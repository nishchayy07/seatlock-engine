export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
      },
      colors: {
        cinema: {
          bg: "#08090d",
          surface: "#0f1117",
          card: "#141720",
          border: "#1e2233",
          muted: "#2a2f45",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(96,165,250,0.12), 0 4px 32px rgba(0,0,0,0.6)",
        "glow-amber": "0 0 0 2px rgba(251,191,36,0.5), 0 0 20px rgba(251,191,36,0.2)",
        "glow-sky": "0 0 0 2px rgba(56,189,248,0.5), 0 0 20px rgba(56,189,248,0.15)",
        "glow-red": "0 0 0 2px rgba(239,68,68,0.5), 0 0 20px rgba(239,68,68,0.2)",
        "glow-orange": "0 0 0 2px rgba(249,115,22,0.4), 0 0 16px rgba(249,115,22,0.15)",
        "seat-hover": "0 0 0 1px rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.5)",
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        "seat-pop": "seat-pop 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "toast-in": "toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "toast-out": "toast-out 0.25s ease-in forwards",
        "shimmer": "shimmer 1.8s linear infinite",
        "float": "float 3s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "fade-in": "fade-in 0.4s ease forwards",
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 2px rgba(251,191,36,0.6), 0 0 12px rgba(251,191,36,0.25)" },
          "50%": { boxShadow: "0 0 0 4px rgba(251,191,36,0.2), 0 0 24px rgba(251,191,36,0.4)" },
        },
        "seat-pop": {
          from: { transform: "scale(0.85)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "toast-in": {
          from: { transform: "translateX(120%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "toast-out": {
          from: { transform: "translateX(0)", opacity: "1" },
          to: { transform: "translateX(120%)", opacity: "0" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
