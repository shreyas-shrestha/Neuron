/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        neuron: {
          bg: "var(--color-bg)",
          subtle: "var(--color-bg-subtle)",
          muted: "var(--color-bg-muted)",
          border: "var(--color-border)",
          "border-strong": "var(--color-border-strong)",
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          mutedText: "var(--color-text-muted)",
          accent: "var(--color-accent)",
          "accent-light": "var(--color-accent-light)",
          "accent-hover": "var(--color-accent-hover)",
          success: "var(--color-success)",
          "success-light": "var(--color-success-light)",
          warning: "var(--color-warning)",
          "warning-light": "var(--color-warning-light)",
          danger: "var(--color-danger)",
          "danger-light": "var(--color-danger-light)",
          low: "var(--color-low)",
          moderate: "var(--color-moderate)",
          high: "var(--color-high)",
          critical: "var(--color-critical)",
        },
        /* Back-compat aliases used in charts / old classes */
        "cyan-accent": "var(--color-accent)",
        "amber-warn": "var(--color-warning)",
        critical: "var(--color-danger)",
        navy: {
          DEFAULT: "var(--color-bg-subtle)",
          2: "var(--color-bg)",
          3: "var(--color-bg-muted)",
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
