## Refactor Plan: Onboarding Flow Alignment With Current Backend

### Current State

Onboarding attuale:
- Frontend con 5 step interattivi e 1 step di loading in [app/onboarding/page.tsx](app/onboarding/page.tsx).
- Payload inviato a generate-plan con campi canonici e metadata UI opzionali allineati al backend.

Backend attuale:
- Validazione stretta su enum e range in [app/api/generate-plan/route.ts](app/api/generate-plan/route.ts).
- Enum canonici correnti:
  Uomo, Donna, Altro
  Principiante, Intermedio, Esperto
  Dimagrimento, Definizione, Mantenimento, Ipertrofia
  Basso, Medio, Alto
  Lento, Normale, Rapido
  Progressivo, Bilanciato, Spinto
- Il backend supporta anche i campi nuovi richiesti dal prompt esterno (regime alimentare, numero pasti, infortuni) mantenendo compatibilità legacy.

Contratto dati:
- Tipi onboarding definiti in [lib/types/database.ts](lib/types/database.ts).
- Nessun file di istruzioni aggiuntive in .github/instructions o .github/copilot-instructions.

### Target State

Obiettivo refactor:
- Portare il flow a 5 step coerenti con la specifica esterna.
- Mantenere compatibilità con l’attuale backend, senza regressioni sui payload già funzionanti.
- Introdurre mapping espliciti da etichette UX umane ai valori canonici backend.
- Estendere il contesto onboarding con i nuovi dati utili ad AI e fallback senza rompere il modello corrente.

Comportamento atteso:
- Step 1: Identità e fisica
- Step 2: Missione
- Step 3: Stile di vita
- Step 4: Esperienza e attrezzatura
- Step 5: Alimentazione e limiti
- Progress bar allineata ai 5 step
- Validazione obbligatoria step-by-step
- Oggetto userProfile locale aggiornato a ogni input

### Affected Files

| File | Change Type | Dependencies |
| ---- | ----------- | ------------ |
| docs/refactor-plan-onboarding-flow-alignment.md | create | blocked by nessuno |
| lib/types/database.ts | modify | blocks app/onboarding/page.tsx, blocks app/api/generate-plan/route.ts |
| app/onboarding/page.tsx | modify | blocked by lib/types/database.ts |
| app/api/generate-plan/route.ts | modify | blocked by lib/types/database.ts, blocked by app/onboarding/page.tsx payload contract |
| docs/refactor-baseline-checklist.md | modify | blocked by final behavior and contract validation |

### Execution Plan

#### Phase 1: Types and Interfaces

- [x] Step 1.1: Estendere OnboardingInput in [lib/types/database.ts](lib/types/database.ts) con campi opzionali per mission reason, infortuni, regime alimentare, meal frequency, goal label UI, livello UI.
- [x] Verify: Nessun errore type nei file che leggono user profile.

- [x] Step 1.2: Definire mapping canonico in onboarding e backend per nuovi label UX.
- [x] Verify: Tabella mapping documentata e coerente tra frontend e route.

Mapping proposto per compatibilità immediata:
- Massa Muscolare -> Ipertrofia
- Performance -> Mantenimento
- Rilassata, Impegnativa, Frenetica -> Basso, Medio, Alto
- Mai, meno di 6 mesi, 1-2 anni, oltre 3 anni -> Principiante, Principiante, Intermedio, Esperto
- Intensità 1-3 -> Progressivo, Bilanciato, Spinto

#### Phase 2: Implementation

- [x] Step 2.1: Rifattorizzare [app/onboarding/page.tsx](app/onboarding/page.tsx) su 5 step secondo specifica esterna mantenendo progress e validazione incrementale.
- [ ] Verify: Flusso manuale completo onboarding senza errori, blocco next se campi obbligatori mancanti.

- [x] Step 2.2: Aggiornare build payload nel frontend con campi nuovi e mapping verso contract canonico.
- [x] Verify: Payload include sia valori canonici sia metadata utili, senza rompere route esistente.

- [x] Step 2.3: Aggiornare [app/api/generate-plan/route.ts](app/api/generate-plan/route.ts) per accettare i nuovi campi opzionali, mantenere backward compatibility e integrare i dati in common context/prompt.
- [x] Verify: POST generate-plan passa con payload vecchio e nuovo.

- [x] Step 2.4: Estendere validazione backend senza irrigidire i nuovi campi opzionali, mantenendo obbligatori storici.
- [x] Verify: Nessun aumento di 400 non previsto su payload già in uso.

#### Phase 3: Tests

- [x] Step 3.1: Introdurre test unitari per mapping e validazione onboarding in [app/api/generate-plan/route.ts](app/api/generate-plan/route.ts) o helper dedicato.
- [x] Verify: Esecuzione test mapping su tutte le opzioni UI nuove.

- [x] Step 3.2: Aggiungere test integrazione per payload onboarding nuovo e legacy.
- [x] Verify: POST generate-plan restituisce success per entrambi i contratti.

- [x] Step 3.3: Eseguire verifiche qualità.
- [x] Verify: npm run lint, npm test, npm run build.

#### Phase 4: Cleanup

- [x] Step 4.1: Rimuovere costanti o copy legacy non più usate in [app/onboarding/page.tsx](app/onboarding/page.tsx).
- [x] Verify: Nessun warning lint per codice morto.

- [x] Step 4.2: Aggiornare documentazione tecnica onboarding e checklist in [docs/refactor-baseline-checklist.md](docs/refactor-baseline-checklist.md).
- [x] Verify: Contratto frontend-backend tracciato e leggibile.

### Rollback Plan

If something fails:

1. Revert della sola Phase attiva mantenendo stabile l’ultima baseline verificata.
2. Ripristino del payload onboarding precedente in [app/onboarding/page.tsx](app/onboarding/page.tsx).
3. Ripristino validazione canonica precedente in [app/api/generate-plan/route.ts](app/api/generate-plan/route.ts).
4. Rilascio solo dopo lint verde e smoke test onboarding completo.

### Risks

- Rischio mapping semantico: Performance mappato a Mantenimento può ridurre precisione obiettivo, mitigazione con campo goal label aggiuntivo nel prompt.
- Rischio regressione validazione: nuovi label UI non mappati possono produrre 400, mitigazione con test tabellari mapping.
- Rischio latenza: più contesto nel prompt può aumentare tempi, mitigazione con prompt compatti e budget token separati.
- Rischio schema misto nel DB: profili vecchi senza nuovi campi, mitigazione con campi opzionali e default non distruttivi.
- Rischio test environment: se toolchain test è incompleta in locale, usare lint e smoke test come gate minimo prima del merge.

Phase 4 completed.
