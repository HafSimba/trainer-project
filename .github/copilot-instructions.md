@workspace Agisci come un Senior Full-Stack Developer e AI Architect. Stiamo sviluppando *"TrAIner"*, una web app *"mobile-first"* che funge da personal trainer e nutrizionista virtuale.

## Tech Stack e Strumenti
- **Framework:** Next.js (App Router) con TypeScript.
- **UI/Styling:** Tailwind CSS (v4) e shadcn/ui.
- **Database:** MongoDB Atlas (NoSQL) tramite MongoDB Node.js Driver.
- **State Management:** Zustand (con middleware persist per il salvataggio nel LocalStorage).
- **Integrazione Hardware:** react-webcam e @zxing/library per la scansione ottica dei codici a barre.
- **Intelligenza Artificiale:** OpenRouter API utilizzando il modello 
vidia/nemotron-nano-12b-v2-vl:free tramite l'SDK openai per Node.js.

## Regole Architetturali Rigide
1. **Gestione dello Stato:** NON utilizzare React Context API per la gestione globale dello stato della chat asincrona dell'AI, per evitare re-render a cascata. Utilizza esclusivamente Zustand per aggiornamenti mirati.
2. **Serverless & Database:** Tutte le funzioni backend risiederanno nelle API Routes di Next.js su Vercel. Usa un pattern di caching globale per l'istanza MongoClient per evitare l'esaurimento del pool di connessioni ad ogni cold start.
3. **Comunicazione AI (Nuova pianificazione):** L'app contatta i server di OpenRouter. L'SDK openai deve essere configurato con la aseURL a https://openrouter.ai/api/v1 ed usare la chiave API (posizionata in OPENROUTER_API_KEY). Si predilige il modello configurato 
vidia/nemotron-nano-12b-v2-vl:free.
4. **Schema Dati:** I dati inviati all'AI devono essere *"Documenti Densi"* (denormalizzati) per risparmiare token. Prediligi riepiloghi giornalieri aggregati.
5. **Mobile-First UX:** La chat dell'AI deve essere onnipresente (es. Bottom Sheet o Floating Action Button) e persistere durante la navigazione tra le pagine.

*Per approfondire ulteriormente i dettagli tecnici, consulta la documentazione interna del progetto nel file C:\Users\Utente\Desktop\ProgettoFianle\trainer-project\Guida Tecnica Webapp TrAIner.md*
