---
name: premium-frontend-ui
description: "A comprehensive guide for GitHub Copilot to craft immersive, high-performance web experiences with advanced motion, typography, and architectural craftsmanship."
---

# Premium Frontend UI Craftsmanship (SKILL)

Purpose

- Provide a reusable, opinionated workflow and checklist for generating "premium" frontend experiences: immersive landing pages, Awwwards-style components, cinematic interfaces, and highly-polished interactive components.
- Use this skill when the user requests a high-end visual experience, refined motion systems, premium typography, or architecture guidance for performance and scale.

When to Use

- Requests like: "Build a premium landing page", "Create an immersive hero with advanced motion", or "Design an interactive portfolio with 3D elements".
- Use for both greenfield pages and component-level work where the visual/interaction quality is a primary requirement.

Clarifying Questions (ask before generating)

- Target framework: `Next.js` / `React` / `Vanilla` / `Astro`?
- Primary aesthetic (choose one): Editorial Brutalism, Organic Fluidity, Cyber/Technical, Cinematic Pacing.
- Must-have libraries allowed? (Framer Motion, Lenis, GSAP, R3F, three.js)
- Are premium fonts and brand assets available? (variable fonts, SVGs, hero imagery)
- Target devices and performance budget (mobile-first constraint, LCP target, JS budget)?
- Accessibility constraints (prefers-reduced-motion, ARIA, keyboard-first interaction)?

Core Workflow (step-by-step)

1. Discovery & constraints
   - Confirm the clarifying answers above.
   - Define success criteria: LCP goal, accessibility target, and visual acceptance criteria.
2. Tokenize design decisions
   - Define a small design token set: color palette, spacing scale, type scale (using `clamp()`), and motion durations/easings.
3. Minimal architecture
   - Create a Motion Provider that centralizes easing/spring params (Framer Motion or GSAP wrapper).
   - Add a Scroll Context (Lenis or a passive ScrollTrigger shim) and expose normalized scroll progress.
4. Entry Sequence (Preloader)
   - Implement a lightweight preloader component that resolves critical fonts/images and provides an animated reveal.
   - Ensure reveal is composited (transform/opacity) and respects `prefers-reduced-motion`.
5. Hero & Topfold
   - Use full-viewport containers, semantic markup, and split characters/words for staggered headline entrances (Split-type compatible).
   - Add depth via layered clipping paths, parallax with transform-only motion, and subtle lighting overlays.
6. Interactions & Microinteractions
   - Build high-fidelity micro-interactions (magnetic buttons, hover depth) but wrap them behind `@media (hover: hover) and (pointer: fine)`.
   - Custom cursor logic must `lerp` position, be disabled for touch, and honor `prefers-reduced-motion`.
7. Progressive enhancement & responsive degradation
   - On touch/low-power devices, reduce animation complexity and fall back to static imagery.
8. Performance & testing
   - Audit bundle size, LCP, CLS, and TTFB. Prefer `transform` and `opacity` for animations.
   - Add unit/component tests for visible behavior where practical and visual snapshots for critical screens.
9. Handoff
   - Provide a concise README with design tokens, motion parameters, and integration notes.

Decision Points & Branching Logic

- If 3D is required → recommend `@react-three/fiber` + `drei` and isolate large assets behind lazy-loaded routes or canvas mounts.
- If minimal JS is a priority → prefer CSS-only micro-interactions, avoid cursor tracking, and use lightweight GSAP timelines for pre-rendered sequences.
- If content is editorial (lots of type) → prioritize fluid typography via `clamp()`, variable fonts, and careful typographic rhythm.

Quality Criteria & Acceptance Checks

- Performance
  - LCP: <= 2.5s (adjust to project constraints)
  - JS initial payload: keep under an agreed budget (e.g., < 150–250 KB gzipped for the page shell)
  - Animations should use `transform`/`opacity` only; `will-change` used sparingly and removed after animations.
- Accessibility
  - Keyboard navigable interactive elements
  - Respect `prefers-reduced-motion`
  - Sufficient color contrast for primary content
- Visual fidelity
  - Hero composition matches approved mock or design intent
  - Motion timing and easing feel consistent via Motion Provider
- Robustness
  - Responsive fallbacks for smaller viewports and touch devices
  - Graceful degradation for missing fonts or images

Implementation Patterns (by target)

- React / Next.js
  - Motion: `framer-motion` for layout transitions and component springs
  - Scroll smoothing: `@studio-freight/lenis`
  - 3D: `@react-three/fiber` (lazy-loaded Canvas)
  - Split-type: `split-type` (or server-side split with CSS split fallbacks)
  - Provide a `MotionProvider` and `ScrollProvider` in `app/layout.tsx` or `pages/_app.tsx`.
- Vanilla / Astro
  - Use GSAP + ScrollTrigger (CDN or small bundle)
  - Lenis for smooth scroll (vanilla)
  - Keep build-time critical CSS minimal and defer heavy JS

Deliverables (what the skill should output)

- Minimal reproducible component or page scaffold with:
  - `Preloader` component
  - `Hero` component scaffold (stagger-ready)
  - `MotionProvider` and `ScrollProvider` wiring
  - Design token file (CSS variables / JS export)
  - README with tokens, motion params, and integration notes
- Optional: small demo page with the hero + microinteractions

Example Prompts (use these to invoke the skill)

- "Build a Next.js landing page hero with Cinematic Pacing using Framer Motion and Lenis. Provide components + token file."
- "Create a magnetic CTA button with custom cursor and fallback for touch devices in React."
- "Generate a preloader + reveal animation (split-door) and ensure reduced-motion support."

Suggested Output Format

- Prefer a small scaffold: folder with components and a short README.
- When returning code in chat, include: file list, short purpose for each file, and a minimal usage example.

Do's and Don'ts

- Do: Animate only `transform` and `opacity` on composited layers.
- Do: Respect `prefers-reduced-motion` and touch-device fallbacks.
- Don't: Attach heavy continuous event listeners to `scroll` without throttling/decoupling.
- Don't: Use `applyTo: "**"` in workspace instructions for broad behaviors.

Testing & Verification

- Visual QA: Chromatic or local visual snapshots for key hero states.
- Performance: Lighthouse or WebPageTest snapshot for the page shell.
- Accessibility: Axe or manual keyboard/passive testing for critical flows.

Related Skills / Next Steps

- `design-token-generator` — create token maps from a style palette
- `motion-presets` — shared motion easing & spring presets generator
- `accessibility-audit` — run automated checks and produce remediation tasks

Maintenance & Handoff Tips

- Keep the MotionProvider surface small and documented.
- Version design tokens near releases; avoid one-off overrides.
- Provide a short set of acceptance tests for the QA engineer (e.g., keyboard navigation, reduced-motion, hero reveal)

Contact / Review Cycle

- After generating the scaffold, ask the user to supply: final hero imagery, final headline copy, and brand fonts.
- Offer 1 revision pass to tune easing, durations, and responsive breakpoints.

---

# End of SKILL.md
