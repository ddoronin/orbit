/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(0 0% 89%)",
        input: "hsl(0 0% 89%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(40 8% 20%)",
        muted: {
          DEFAULT: "hsl(40 14% 95%)",
          foreground: "hsl(40 5% 46%)",
        },
        accent: {
          DEFAULT: "hsl(40 9% 93%)",
          foreground: "hsl(40 8% 20%)",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      boxShadow: {
        notion: "0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};
