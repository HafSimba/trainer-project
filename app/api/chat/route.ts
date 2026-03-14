import { OpenAI } from "openai";
import clientPromise from "@/lib/mongodb";

export const revalidate = 0;
export const fetchCache = 'force-no-store';

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://trainer-project.vercel.app",
        "X-Title": "TrAIner",
    }
});

const PROTOTYPE_USER_ID = "tester-user-123";

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        const cleanMessages = messages.filter((m: any) => !m.content.includes("Impossibile contattare TrAIner"));

        let userContextStr = "Nessun dato nutrizionale in memoria al momento.";
        let profileContextStr = "";

        try {
            const today = new Date().toISOString().split('T')[0];
            const mongoClient = await clientPromise;
            const db = mongoClient.db("trainer_db");

            // FETCH DEL PROFILO E PIANO GENERATO DALL'AI
            const userProfile = await db.collection("user_profiles").findOne({ userId: PROTOTYPE_USER_ID });
            if (userProfile) {
                profileContextStr = `\nPROFILO UTENTE:\nNome: ${userProfile.name}\nObiettivi e Target:\nCalorie: ${userProfile.targets?.daily_calories}, Proteine: ${userProfile.targets?.daily_protein_g}, Carbo: ${userProfile.targets?.daily_carbs_g}, Grassi: ${userProfile.targets?.daily_fats_g}.\nPiano allenamento: ${userProfile.workout_plan?.split_name || 'Non specificato'} - ${userProfile.workout_plan?.description || ''}.\n`;
            }

            const collection = db.collection("daily_logs");
            const log = await collection.findOne({ userId: PROTOTYPE_USER_ID, date: today });

            if (log && log.daily_nutrition_summary) {
                userContextStr = 'Oggi utente ha consumato: ' + Math.round(log.daily_nutrition_summary.total_calories || 0) + ' kcal. ';
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

        const systemMessage = {
            role: "system",
            content: "Sei TrAIner, il personal trainer e nutrizionista AI dell'utente. Rispondi in modo conciso e amichevole in italiano. " + profileContextStr + " CONTESTO NUTRIZIONALE OGGI (" + new Date().toISOString().split('T')[0] + "): " + userContextStr
        };

        const response = await client.chat.completions.create({
            model: "nvidia/nemotron-nano-12b-v2-vl:free",
            messages: [systemMessage, ...cleanMessages],
            stream: false,
        });

        const replyContent = response.choices[0]?.message?.content || "Scusa, non sono riuscito a elaborare la risposta.";

        return Response.json({ content: replyContent });

    } catch (error) {
        console.error("AI API Error:", error);
        return new Response(JSON.stringify({ error: "Errore di connessione al modello AI OpenRouter." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
