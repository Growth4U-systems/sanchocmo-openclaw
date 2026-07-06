import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Comic UI semantic colors (legacy single-shade)
        rust: "var(--rust)",
        navy: "var(--navy)",
        sage: "var(--sage)",
        aged: "var(--aged)",
        ink: "var(--ink)",
        parchment: "var(--parchment)",

        // Sancho Comic — full shade scale (Content Engine UI)
        sc: {
          ink: "var(--sc-ink)",
          "ink-soft": "var(--sc-ink-soft)",
          paper: "var(--sc-paper)",
          "paper-2": "var(--sc-paper-2)",
          "paper-3": "var(--sc-paper-3)",
          rust: {
            50: "var(--sc-rust-50)",
            100: "var(--sc-rust-100)",
            300: "var(--sc-rust-300)",
            500: "var(--sc-rust-500)",
            600: "var(--sc-rust-600)",
            700: "var(--sc-rust-700)",
          },
          sun: {
            50: "var(--sc-sun-50)",
            100: "var(--sc-sun-100)",
            300: "var(--sc-sun-300)",
            500: "var(--sc-sun-500)",
          },
          navy: {
            500: "var(--sc-navy-500)",
            700: "var(--sc-navy-700)",
          },
          sage: {
            100: "var(--sc-sage-100)",
            500: "var(--sc-sage-500)",
          },
          brick: {
            500: "var(--sc-brick-500)",
            bg: "var(--sc-brick-bg)",
          },
          fg: {
            soft: "var(--sc-fg-soft)",
            muted: "var(--sc-fg-muted)",
            subtle: "var(--sc-fg-subtle)",
          },
        },
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
        heading: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["Source Code Pro", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "sc-md": "var(--sc-r-md)",
        "sc-lg": "var(--sc-r-lg)",
        "sc-tile": "var(--sc-r-tile)",
        "sc-pill": "var(--sc-r-pill)",
      },
      boxShadow: {
        comic: "4px 4px 0 var(--ink)",
        "comic-sm": "3px 3px 0 var(--ink)",
        "pop-xs": "var(--pop-xs)",
        "pop-sm": "var(--pop-sm)",
        "pop-md": "var(--pop-md)",
        "pop-lg": "var(--pop-lg)",
      },
      transitionTimingFunction: {
        pop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
