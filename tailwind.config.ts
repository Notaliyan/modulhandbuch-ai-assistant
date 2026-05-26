import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      colors: {
        // Core backgrounds — ultra-matte dark hierarchy
        background: {
          DEFAULT: "#0B0F19",   // primary canvas
          subtle:  "#0E1220",   // slightly lifted surfaces
          muted:   "#111827",   // secondary cards / panels
          raised:  "#161D2F",   // tertiary raised elements
          overlay: "#1C2438",   // modals, popovers
        },

        // Surface colors for cards, inputs, and containers
        surface: {
          DEFAULT: "#111827",   // base card background
          hover:   "#16202F",   // card hover state
          active:  "#1A2640",   // pressed / active state
          glass:   "rgba(17, 24, 39, 0.72)", // frosted-glass panels
        },

        // Border palette — transparent violet / indigo aesthetic
        border: {
          DEFAULT:  "rgba(139, 92, 246, 0.14)",   // base border
          subtle:   "rgba(99, 102, 241, 0.10)",    // hairline dividers
          strong:   "rgba(139, 92, 246, 0.28)",    // emphasis borders
          focus:    "rgba(139, 92, 246, 0.55)",    // focus rings
          glow:     "rgba(139, 92, 246, 0.40)",    // glowing outlines
        },

        // Primary brand — violet spectrum
        primary: {
          50:  "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          300: "#C4B5FD",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          800: "#5B21B6",
          900: "#4C1D95",
          950: "#2E1065",
          DEFAULT: "#8B5CF6",
          hover:   "#7C3AED",
          active:  "#6D28D9",
        },

        // Accent — indigo for secondary interactive elements
        accent: {
          50:  "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
          950: "#1E1B4B",
          DEFAULT: "#6366F1",
          hover:   "#4F46E5",
          active:  "#4338CA",
        },

        // Typography — clean slate whites and muted grays
        text: {
          primary:   "#F1F5F9",   // headings, primary labels
          secondary: "#94A3B8",   // body text, descriptions
          muted:     "#64748B",   // placeholders, hints, meta
          disabled:  "#334155",   // disabled states
          inverse:   "#0B0F19",   // text on bright backgrounds
          link:      "#A78BFA",   // hyperlinks
          "link-hover": "#C4B5FD",
        },

        // Semantic status colors
        success: {
          DEFAULT: "#10B981",
          subtle:  "rgba(16, 185, 129, 0.12)",
          border:  "rgba(16, 185, 129, 0.24)",
          text:    "#34D399",
        },
        warning: {
          DEFAULT: "#F59E0B",
          subtle:  "rgba(245, 158, 11, 0.12)",
          border:  "rgba(245, 158, 11, 0.24)",
          text:    "#FCD34D",
        },
        error: {
          DEFAULT: "#EF4444",
          subtle:  "rgba(239, 68, 68, 0.12)",
          border:  "rgba(239, 68, 68, 0.24)",
          text:    "#FCA5A5",
        },
        info: {
          DEFAULT: "#3B82F6",
          subtle:  "rgba(59, 130, 246, 0.12)",
          border:  "rgba(59, 130, 246, 0.24)",
          text:    "#93C5FD",
        },

        // Processing status chip colors
        status: {
          processing: "#F59E0B",
          ready:      "#10B981",
          failed:     "#EF4444",
          indexing:   "#6366F1",
        },
      },

      // ─── Typography ────────────────────────────────────────────────────────
      fontFamily: {
            sans:    ["var(--font-inter)",      ...defaultTheme.fontFamily.sans],
            mono:    ["var(--font-geist-mono)", ...defaultTheme.fontFamily.mono],
            display: ["var(--font-inter)",      ...defaultTheme.fontFamily.sans],
        },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },

      // ─── Spacing & Sizing ──────────────────────────────────────────────────
      spacing: {
        "4.5":  "1.125rem",
        "13":   "3.25rem",
        "15":   "3.75rem",
        "18":   "4.5rem",
        "22":   "5.5rem",
        "112":  "28rem",
        "128":  "32rem",
        "144":  "36rem",
      },

      // ─── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },

      // ─── Box Shadows — glow-based dark-mode shadows ────────────────────────
      boxShadow: {
        // Subtle elevation
        "card":        "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5)",
        "card-hover":  "0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)",
        "card-raised": "0 8px 24px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4)",

        // Violet glow effects
        "glow-sm":   "0 0 12px rgba(139, 92, 246, 0.25)",
        "glow-md":   "0 0 24px rgba(139, 92, 246, 0.30)",
        "glow-lg":   "0 0 48px rgba(139, 92, 246, 0.20)",
        "glow-xl":   "0 0 80px rgba(139, 92, 246, 0.15)",

        // Indigo accent glow
        "glow-accent-sm": "0 0 12px rgba(99, 102, 241, 0.25)",
        "glow-accent-md": "0 0 24px rgba(99, 102, 241, 0.30)",

        // Input focus ring
        "focus-ring": "0 0 0 3px rgba(139, 92, 246, 0.35)",

        // Inner shadow for inset depth
        "inner-depth": "inset 0 2px 8px rgba(0,0,0,0.40)",
      },

      // ─── Background Images / Gradients ────────────────────────────────────
      backgroundImage: {
        // Subtle noise texture overlay
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",

        // Brand gradients
        "gradient-primary":         "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
        "gradient-primary-subtle":  "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(99,102,241,0.08) 100%)",
        "gradient-surface":         "linear-gradient(180deg, #161D2F 0%, #111827 100%)",
        "gradient-card":            "linear-gradient(145deg, #16202F 0%, #111827 100%)",
        "gradient-glow-radial":     "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(139,92,246,0.18) 0%, transparent 70%)",
        "gradient-glow-conic":      "conic-gradient(from 180deg at 50% 50%, #8B5CF6, #6366F1, #8B5CF6)",

        // Chat UI gradients
        "gradient-chat-bg":         "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 60%)",
        "gradient-sidebar":         "linear-gradient(180deg, #0E1220 0%, #0B0F19 100%)",

        // Mesh gradient for hero sections
        "gradient-mesh":
          "radial-gradient(at 27% 37%, rgba(139,92,246,0.08) 0px, transparent 50%), " +
          "radial-gradient(at 97% 21%, rgba(99,102,241,0.06) 0px, transparent 50%), " +
          "radial-gradient(at 52% 99%, rgba(109,40,217,0.07) 0px, transparent 50%)",
      },

      // ─── Animations & Keyframes ────────────────────────────────────────────
      keyframes: {
        // Smooth fade-in
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },

        // Slide animations
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-left": {
          "0%":   { opacity: "0", transform: "translateX(8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-right": {
          "0%":   { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },

        // Scale animations
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          "0%":   { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },

        // Pulse glow for loading/processing states
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(139, 92, 246, 0.2)" },
          "50%":      { boxShadow: "0 0 28px rgba(139, 92, 246, 0.5)" },
        },

        // Shimmer for skeleton loaders
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },

        // Typing indicator dots
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.3" },
          "40%":           { transform: "scale(1)",   opacity: "1" },
        },

        // Gradient border spin
        "border-spin": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },

        // Accordion open/close
        "accordion-down": {
          "0%":   { height: "0" },
          "100%": { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          "0%":   { height: "var(--radix-accordion-content-height)" },
          "100%": { height: "0" },
        },
      },

      animation: {
        "fade-in":       "fade-in 0.2s ease-out",
        "fade-out":      "fade-out 0.15s ease-in",
        "slide-up":      "slide-up 0.25s ease-out",
        "slide-down":    "slide-down 0.25s ease-out",
        "slide-left":    "slide-left 0.25s ease-out",
        "slide-right":   "slide-right 0.25s ease-out",
        "scale-in":      "scale-in 0.2s ease-out",
        "scale-out":     "scale-out 0.15s ease-in",
        "pulse-glow":    "pulse-glow 2.5s ease-in-out infinite",
        "shimmer":       "shimmer 1.8s linear infinite",
        "bounce-dot":    "bounce-dot 1.2s ease-in-out infinite",
        "border-spin":   "border-spin 3s linear infinite",
        "accordion-down":"accordion-down 0.2s ease-out",
        "accordion-up":  "accordion-up 0.2s ease-out",
        "spin-slow":     "spin 3s linear infinite",
      },

      // ─── Backdrop Blur ─────────────────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
      },

      // ─── Transition Durations ──────────────────────────────────────────────
      transitionDuration: {
        "50":  "50ms",
        "400": "400ms",
      },

      // ─── Z-Index Scale ─────────────────────────────────────────────────────
      zIndex: {
        "60": "60",
        "70": "70",
        "80": "80",
        "90": "90",
        "100": "100",
      },
    },
  },

  plugins: [],
};

export default config;