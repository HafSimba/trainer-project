# Refactor Plan: Onboarding Generate-Plan Performance

## Obiettivo

Ridurre drasticamente la latenza della generazione iniziale e abbattere il fallback non personalizzato, migliorando anche la UX di attesa lato onboarding.

## Problemi Attuali

- Tempo di risposta spesso oltre 60 secondi in produzione.
- Fallback frequente su piano allenamento/alimentazione con struttura quasi identica.
- Progress bar onboarding non allineata agli stati reali backend.
- Nessuna telemetria operativa strutturata per capire dove si perde tempo.
- Rischio architetturale: uso di `PROTOTYPE_USER_ID` (da sostituire con utente autenticato).

## KPI di Successo

- `POST /api/generate-plan` p50 < 8s
- `POST /api/generate-plan` p95 < 20s
- Fallback rate complessivo < 10%
- Errore 5xx su generate-plan < 1%
- Tempo percepito in onboarding ridotto tramite stati reali e feedback progressivo

## Flow Corrente (Sintesi)

1. Onboarding invia payload completo a `POST /api/generate-plan`.
2. Backend valida input, crea prompt workout/diet e richiama LLM in parallelo.
3. Ogni sezione fa retry per modello; se fallisce, applica fallback locale.
4. Sanitizza, applica restrizioni alimentari, salva su `user_profiles`.
5. Frontend mostra progress simulato e reindirizza a dashboard a risposta completata.

## Piano Step-by-Step

### Step 1 - Osservabilita

Scope:

- Aggiungere telemetria su `POST /api/generate-plan`.
- Tracciare tempi per parsing body, validazione, prompt build, chiamate LLM, merge/sanitize, salvataggio.
- Tracciare tentativi per modello e fallback workout/diet.

Output atteso:

- Log strutturati utili a misurare p50/p95 e root cause fallback.

Verifica:

- `npm run lint`
- Invocazione manuale endpoint e controllo log server

Stato:

- Completato in questa iterazione con telemetria strutturata su tempi, tentativi per modello e fallback.

### Step 2 - Latenza e affidabilita LLM

Scope:

- Timeout per singolo tentativo LLM con abort controllato.
- Riduzione output budget (`max_tokens`) e prompt piu compatti.
- Retry policy mirata (retry solo su errori transitori).

Output atteso:

- Riduzione netta latenza media e code path di retry infinito.

Verifica:

- `npm run lint`
- Test manuale con 5 payload diversi e confronto tempi pre/post

Stato:

- Completato in questa iterazione con timeout, token budget configurabile e retry selettivo.

### Step 3 - Fallback personalizzato

Scope:

- Rendere fallback fortemente dipendente da obiettivo, attitudine, livello, equipaggiamento e restrizioni.
- Ridurre elementi statici ripetuti nei piani fallback.

Output atteso:

- Piani fallback meno uniformi e piu aderenti ai dati utente.

Verifica:

- `npm run lint`
- Confronto output fallback su profili molto diversi

Stato:

- Completato in questa iterazione con fallback deterministico ma variabile su goal, livello, stress, equipaggiamento e giorni disponibili.

### Step 4 - UX loading reale

Scope:

- Esporre stati reali backend e agganciare progress UI a tali stati.
- Migliorare copy e feedback temporale (fase corrente, avanzamento reale, eventuale background completion).

Output atteso:

- Attesa percepita piu corta e maggiore trasparenza sullo stato.

Verifica:

- `npm run lint`
- Smoke test onboarding su mobile/desktop

Stato:

- Completato in questa iterazione con progress deterministico, timeline fasi visibile e feedback tempo trascorso.

### Step 5 - Correzione identita utente

Scope:

- Sostituire `PROTOTYPE_USER_ID` con userId reale da sessione/autenticazione.
- Evitare sovrascritture tra utenti in produzione.

Output atteso:

- Profili isolati per utente, fine del comportamento "piani uguali" da collisione dati.

Verifica:

- `npm run lint`
- Test con 2 utenti distinti su flusso completo

Stato:

- Completato in questa iterazione su onboarding, generate-plan, dashboard, profile, diary/search e chat API con risoluzione userId via cookie/local storage.

## Rollback

Se uno step introduce regressioni:

1. Revert dello step corrente.
2. Ripristino baseline precedente valida.
3. Rilascio solo dopo nuova verifica tecnica.

## Registro Avanzamento

- [x] Analisi flow onboarding + backend
- [x] Definizione piano tecnico incrementale
- [x] Step 1 completato
- [x] Step 2 completato
- [x] Step 3 completato
- [x] Step 4 completato
- [x] Step 5 completato
