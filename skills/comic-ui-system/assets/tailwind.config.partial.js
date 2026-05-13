// Comic UI Design System — Tailwind Extension
// Merge into your tailwind.config.ts theme.extend

module.exports = {
  colors: {
    comic: {
      parchment: "#F5F0E6",
      paper: "#FDF8EF",
      aged: "#E8DCC8",
      ink: "#1A1A2E",
      "ink-soft": "#2D2D44",
      rust: "#C45D35",
      "rust-light": "#D4734F",
      "rust-dark": "#A34A28",
      navy: "#1E3A5F",
      cyan: "#3B9EBF",
      "cyan-light": "#5BBAD9",
      yellow: "#F2C94C",
      "yellow-pale": "#FFF3C4",
      sage: "#4A5D23",
      red: "#C0392B",
    },
  },
  boxShadow: {
    comic: "6px 6px 0px 0px #1A1A2E",
    "comic-lg": "8px 8px 0px 0px #1A1A2E",
    "comic-xl": "10px 10px 0px 0px #1A1A2E",
    "comic-sm": "4px 4px 0px 0px #1A1A2E",
    "comic-xs": "3px 3px 0px 0px #1A1A2E",
  },
  transitionTimingFunction: {
    "soft-out": "cubic-bezier(0.16, 1, 0.3, 1)",
    "soft-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
}
