# Refactor Baseline & No-Regression Checklist

## Obiettivo

Refactor incrementale **senza alterare il comportamento funzionale** dell'app TrAIner.
Ogni step deve essere piccolo, verificabile e reversibile.

## Regole operative per ogni step

1. Toccare solo i file previsti nello step.
2. Non cambiare contratti API (`request/response`) se non strettamente necessario.
3. Nessuna modifica UX non richiesta (copy, layout, flussi) durante refactor strutturale.
4. Prima di chiudere lo step: verifiche tecniche + smoke test funzionali.

## Baseline tecnica (corrente)

- Framework: Next.js App Router + TypeScript
- Stato build: `npm run build` ✅
- Script disponibili:
  - `npm run dev`
  - `npm test`
  - `npm run test:watch`
  - `npm run build`
  - `npm run start`
  - `npm run lint`

## Flussi funzionali critici da preservare

### 1) Onboarding → Generazione piano

- Pagina: `app/onboarding/page.tsx`
- API: `app/api/generate-plan/route.ts`
- Atteso:
  - validazioni step attive
  - invio payload completo
  - salvataggio profilo su `user_profiles`
  - redirect dashboard al termine

### 2) Dashboard giornaliera

- Pagina: `app/page.tsx`
- API: `app/api/logs/route.ts`, `app/api/profile/route.ts`
- Atteso:
  - caricamento riepilogo nutrizionale
  - workout del giorno
  - prossimo pasto dal piano dieta

### 3) Diario alimentare

- Pagina: `app/diary/page.tsx`
- API: `app/api/logs/route.ts`
- Atteso:
  - aggiunta alimento
  - modifica alimento
  - eliminazione alimento
  - ricalcolo macro/calorie coerente
  - target calorie letto dal profilo (`/api/profile`)

### 4) Profilo piano

- Pagina: `app/profile/page.tsx`
- Atteso:
  - rendering obiettivi, workout schedule e dieta settimanale

### 5) Chat AI

- Componenti/API: `components/AiChatSheet.tsx`, `app/api/chat/route.ts`
- Atteso:
  - invio/ricezione messaggi
  - markdown assistant renderizzato
  - report giornaliero su keyword (confronto target vs consumati + workout)

## Contratti API minimi da mantenere

### `POST /api/generate-plan`

- Input onboarding valido (dati fisici, attitudinali, restrizioni alimentari)
- Output: piano persistito in `user_profiles`

### `GET /api/profile?userId=...`

- Output: profilo utente completo oppure `{ error: "Nessun profilo trovato." }` con status `200`

## Cleanup legacy `etaGenere` (single responsibility)

- Single source of truth: `lib/profile-legacy.ts`
  - `LEGACY_PROFILE_FILTER`: filtro unificato per documenti legacy
  - `LEGACY_PROFILE_UNSET`: campi legacy da rimuovere in ogni update
  - `sanitizeLegacyProfileFields(...)`: sanitizzazione payload prima del `$set`
- Punto di cleanup batch: `GET /api/db-init`
- Guard rail sui writer profilo:
  - `POST /api/profile` applica sanitizzazione + `$unset` legacy
  - `POST /api/generate-plan` applica sanitizzazione + `$unset` legacy
- Obiettivo verificabile: i documenti aggiornati dai writer non possono reintrodurre `etaGenere`.

### `GET /api/logs?userId=...&date=YYYY-MM-DD`

- Output: log giornaliero con `daily_nutrition_summary` e `meals_log`

### `POST /api/logs`

- `action=add_meal|edit_meal|delete_meal|update_water`
- Output: `{ success: true, log: ... }`

### `POST /api/chat`

- Input: `{ messages: [...] }`
- Output: `{ content: string }`

## Verifica standard per ogni step

### A. Verifica tecnica

- Eseguire in sequenza:
  - `npm test`
  - `npm run lint`
  - `npm run build`
- Se lo step tocca API: verificare assenza errori runtime lato route

### B. Smoke test manuale (rapido)

1. Aprire dashboard `/`
2. Verificare diario `/diary` (add/edit/delete almeno un item)
3. Verificare chat (messaggio normale + richiesta report)
4. Se toccato onboarding/profile: percorrere anche quei flussi

## Definition of Done dello step

Uno step è completo solo se:

- refactor applicato ai file target
- test verdi
- build verde
- smoke test coerente con i flussi interessati
- nessuna regressione osservata sui percorsi critici

## Checklist verifica deploy

1. Variabili ambiente presenti (`MONGODB_URI`, variabili LLM, variabili FatSecret quando attive)
2. `npm ci`
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. Smoke test rapido su route critiche:

- `GET /api/profile?userId=<id>`
- `POST /api/profile`
- `POST /api/generate-plan`
- `POST /api/logs`

7. Verifica osservabilità minima:

- assenza errori server su route API durante gli smoke test

## Sequenza step approvata

1. Baseline e checklist
2. Refactor `app/api/chat/route.ts`
3. Refactor `app/api/generate-plan/route.ts`
4. Refactor `app/onboarding/page.tsx`
5. Refactor `app/diary/page.tsx`
6. Refactor `components/AiChatSheet.tsx` + `components/ui/sheet.tsx`
7. Allineamento tipi in `lib/types/database.ts`
8. Refactor `app/api/profile/route.ts` + `app/api/logs/route.ts` (+ eventuale allineamento pagine)
9. Validazione finale end-to-end
