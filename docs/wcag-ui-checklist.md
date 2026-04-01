# WCAG UI Checklist - TrAIner

Data: 2026-04-01
Ambito: refactor UI `Performance Sage` su shell, navigazione, onboarding, profile, diario/search

## 1. Contrasto Colori

- [x] Testo primario su superfici card (`text-foreground` su `bg-card`) leggibile.
- [x] Bottoni primari con `text-primary-foreground` su `bg-primary`.
- [x] Messaggi errore (`destructive`) distinti e leggibili anche in stato hover/focus.
- [x] Badge macro (warning/success/info) con contrasto sufficiente per testo breve.
- [ ] Verifica automatica con tool esterno (Axe/ Lighthouse) su tutte le route in staging.

## 2. Focus Order e Focus Visible

- [x] Navigazione inferiore con `focus-visible` esplicito su tutti i link.
- [x] Pulsanti custom in onboarding (sesso/allergie) con ring visibile da tastiera.
- [x] Select in diary/search con focus ring e label associata (`htmlFor` + `id`).
- [x] Icon button con `aria-label` dove necessario (back, search, scanner, delete, add).
- [ ] Test manuale tab-order completo su mobile con tastiera esterna.

## 3. Keyboard Flows

- [x] Ricerca alimenti: invio da tastiera (`Enter`) avvia ricerca.
- [x] Form onboarding: navigazione step con pulsanti accessibili.
- [x] CTA principali raggiungibili senza mouse in home/diary/profile.
- [ ] Validare percorso completo onboarding -> home -> diary -> search solo tastiera.

## 4. Motion e Preferenze Utente

- [x] Micro-motion basate solo su `transform` e `opacity`.
- [x] Utility `motion-enter` con delay progressivi per blocchi principali.
- [x] Fallback completo con `@media (prefers-reduced-motion: reduce)`.
- [ ] Verifica visuale su device low-end per confermare fluidita.

## 5. Stato di Rilascio

- [x] Refactor applicato su `onboarding`, `profile`, `diary/search`.
- [x] Navbar inferiore resa persistentemente disponibile nel layout.
- [ ] Eseguire audit Axe in CI.
- [ ] Eseguire screenshot regression per view mobile principali.
