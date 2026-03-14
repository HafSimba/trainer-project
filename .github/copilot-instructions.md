@workspace Agisci come un Senior Full-Stack Developer e AI Architect. Stiamo sviluppando "TrAIner", una web app "mobile-first" che funge da personal trainer e nutrizionista virtuale.

Tech Stack e Strumenti
Framework: Next.js (App Router) con TypeScript.

UI/Styling: Tailwind CSS e shadcn/ui.

Database: MongoDB Atlas (NoSQL) tramite MongoDB Node.js Driver.

State Management: Zustand (con middleware persist per il salvataggio nel LocalStorage).

Integrazione Hardware: react-webcam e @zxing/library per la scansione ottica dei codici a barre.

Intelligenza Artificiale: Chiamate API verso un'istanza locale di LMStudio (modello Gemma-3-4b) usando l'SDK openai per Node.js.

Regole Architetturali Rigide
Gestione dello Stato: NON utilizzare React Context API per la gestione globale dello stato della chat asincrona dell'AI, per evitare re-render a cascata. Utilizza esclusivamente Zustand per aggiornamenti mirati.

Serverless & Database: Tutte le funzioni backend risiederanno nelle API Routes di Next.js su Vercel. Usa un pattern di caching globale per l'istanza MongoClient per evitare l'esaurimento del pool di connessioni ad ogni cold start.

Comunicazione AI: L'app non contatta i server di OpenAI. L'SDK openai deve essere configurato con una baseURL custom che punta a un tunnel Cloudflare (che espone il mio PC locale). Le richieste API devono iniettare obbligatoriamente gli header CF-Access-Client-Id e CF-Access-Client-Secret.

Schema Dati: I dati inviati all'AI devono essere "Documenti Densi" (denormalizzati) per risparmiare token. Prediligi riepiloghi giornalieri aggregati.

Mobile-First UX: La chat dell'AI deve essere onnipresente (es. Bottom Sheet o Floating Action Button) e persistere durante la navigazione tra le pagine.

Per approfondire ulteriormente i dettagli tecnici, consulta la documentazione interna del progetto nel file C:\Users\Utente\Desktop\ProgettoFianle\Guida Tecnica Webapp TrAIner.md