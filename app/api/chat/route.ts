import { OpenAI } from "openai";
import clientPromise from "@/lib/mongodb";

export const revalidate = 0; 
export const fetchCache = 'force-no-store';

// Auto-fix the URL in case the user forgets to append '/v1' in Vercel.
let safeBaseURL = process.env.TUNNEL_CLOUDFLARED || "";
if (safeBaseURL && !safeBaseURL.endsWith('/v1') && !safeBaseURL.endsWith('/v1/')) {
    safeBaseURL = safeBaseURL.replace(/\/$/, '') + '/v1';
}

const client = new OpenAI({
    baseURL: safeBaseURL,
    apiKey: "not-needed",
    defaultHeaders: {
        "CF-Access-Client-Id": process.env.CF_CLIENT_ID || "",
        "CF-Access-Client-Secret": process.env.CF_CLIENT_SECRET || "",
    }
});

const PROTOTYPE_USER_ID = "tester-user-123";

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        // Pulisce l'history in modo da NON inoltrare i messaggi di "Errore" del frontend ad AI
        const cleanMessages = messages.filter((m: any) => !m.content.includes("Impossibile contattare TrAIner"));

        let userContextStr = "Nessun dato nutrizionale in memoria al momento."; 
        try {
            const today = new Date().toISOString().split('T')[0];
            const mongoClient = await clientPromise;
            const db = mongoClient.db("trainer_db");
            const collection = db.collection("daily_logs");

            const log = await collection.findOne({ userId: PROTOTYPE_USER_ID, date: today });
            if (log && log.daily_nutrition_summary) {
                userContextStr = 'Oggi l utente ha consumato: ' + Math.round(log.daily_nutrition_summary.total_calories || 0) + ' kcal. ';
                if (log.meals_log && log.meals_log.length > 0) {
                    userContextStr += 'Ultimi pasti salvati: ';
                    log.meals_log.forEach((m: any) => {
                        userContextStr += m.name + ' (' + m.calories + ' kcal), ';
                    });
                } else {
                    userContextStr += "Nessun pasto registrato oggi. ";
                }
            } else {
                 userContextStr = "L'utente non ha registrato pasti. Ricordagli di aggiungere i pasti alla dashboard se fa domande o si aspetta che tu li sappia.";
            }
        } catch (e) {
            console.error("DB Fetch Error in Chat Route:", e);
        }

        console.log('Sending Context:', userContextStr);
        const systemMessage = {
             role: "system",
             content: "Sei TrAIner, il personal trainer e nutrizionista AI dell'utente. Rispondi in modo conciso in italiano. CONTESTO UTENTE OGGI (" + new Date().toISOString().split('T')[0] + "): " + userContextStr
        };

        const response = await client.chat.completions.create({
            model: "qwen2.5-vl-7b-instruct",
            messages: [systemMessage, ...cleanMessages],
            stream: true,
        });

        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of response) {
                    const text = chunk.choices[0]?.delta?.content || "";        
                    if (text) {
                        controller.enqueue(text);
                    }
                }
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });

    } catch (error) {
        console.error("AI API Error:", error);
        return new Response(JSON.stringify({ error: "Errore di connessione al modello AI." }), { status: 500 });
    }
}
