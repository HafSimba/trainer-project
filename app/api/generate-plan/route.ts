import { OpenAI } from 'openai';
import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export const revalidate = 0;

const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        'HTTP-Referer': 'https://trainer-project.vercel.app',
        'X-Title': 'TrAIner',
    }
});

const PROTOTYPE_USER_ID = 'tester-user-123';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { username, etaGenere, peso, livelloAttuale, obiettivoPrimario, tempoDisponibile, equipaggiamento } = body;

        const commonContext = `Nome: ${username}
Età e Genere: ${etaGenere}
Peso: ${peso}
Livello: ${livelloAttuale}
Obiettivo: ${obiettivoPrimario}
Tempo: ${tempoDisponibile}
Equipaggiamento: ${equipaggiamento}`;

        const workoutPrompt = `Sei un AI Personal Trainer esperto.
Genera SOLO la parte di allenamento e i target calorici/macros per questo utente:
${commonContext}

REGOLE TASSATIVE:
1. Il NUMERO DI GIORNI di allenamento ("schedule") DEVE RISPETTARE ESATTAMENTE quanto scritto nel "Tempo" dall'utente.
2. L'output deve essere SOLO E UNICAMENTE un JSON valido (privo di markdown addizionali come \`\`\`json).

STRUTTURA JSON DA RISPETTARE:
{
    "personal_info": { "age": 30, "gender": "M", "activity_level": "moderato" },
    "targets": { "daily_calories": 2500, "daily_protein_g": 160, "daily_carbs_g": 250, "daily_fats_g": 80, "daily_water_ml": 3000 },
    "workout_plan": {
        "split_name": "Push Pull Legs",
        "description": "Breve descrizione",
        "schedule": [
            { "day_name": "Lunedì", "workout_type": "Push", "exercises": [ { "name": "Panca", "sets": 3, "reps": "8-10", "notes": "Fermo al petto" } ] }
        ]
    }
}
NON RESTITUIRE NULL'ALTRO OLTRE L'OGGETTO JSON.`;

        const dietPrompt = `Sei un AI Nutrizionista esperto.
Genera SOLO la scheda alimentare completa della settimana per questo utente:
${commonContext}

REGOLE TASSATIVE:
1. "diet_plan.weekly_schedule" DEVE contenere ESATTAMENTE 7 giorni (da Lunedì a Domenica), indicando per ogni pasto gli alimenti esatti con la quantità in g/ml. Esempio pasto: ["50g Avena", "200ml Latte"].
2. L'output deve essere SOLO E UNICAMENTE un JSON valido (privo di markdown addizionali come \`\`\`json).

STRUTTURA JSON DA RISPETTARE:
{
    "diet_plan": {
        "weekly_schedule": [
            {
                "day_name": "Lunedì",
                "meals": {
                    "colazione": ["50g avena", "100g yogurt greco"],
                    "pranzo": ["100g riso", "150g pollo", "insalata"],
                    "cena": ["100g pane", "200g merluzzo"],
                    "snack": ["30g whey", "1 mela"]
                }
            }
        ]
    },
    "diet_rules": { "meal_timing": "3 pasti", "preferred_foods": ["riso", "pollo"], "forbidden_foods": ["fritto"] }
}
NON RESTITUIRE NULL'ALTRO OLTRE L'OGGETTO JSON.`;

        // Esegeuizione parallela per risparmiare tempo
        const [workoutResponse, dietResponse] = await Promise.all([
            client.chat.completions.create({
                model: 'google/gemini-2.5-flash',
                messages: [{ role: 'system', content: workoutPrompt }],
                max_tokens: 4000
            }),
            client.chat.completions.create({
                model: 'google/gemini-2.5-flash',
                messages: [{ role: 'system', content: dietPrompt }],
                max_tokens: 4000
            })
        ]);

        let workoutText = workoutResponse.choices[0]?.message?.content || '{}';
        workoutText = workoutText.replace(/```json/g, '').replace(/```/g, '').trim();

        let dietText = dietResponse.choices[0]?.message?.content || '{}';
        dietText = dietText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Facciamo il parse di entrambi
        const workoutData = JSON.parse(workoutText);
        const dietData = JSON.parse(dietText);

        // Uniamo le due risposte in un unico grande oggetto
        const planData = {
            ...workoutData,
            ...dietData
        };

        const mongoClient = await clientPromise;
        const db = mongoClient.db('trainer_db');
        const userProfile = {
            userId: PROTOTYPE_USER_ID,
            name: username || 'Utente',
            ...planData
        };

        const result = await db.collection('user_profiles').findOneAndUpdate(
            { userId: PROTOTYPE_USER_ID },
            { $set: userProfile },
            { upsert: true, returnDocument: 'after' }
        );

        return NextResponse.json({ success: true, profile: result });
    } catch (error: any) {
        console.error("Errore Gen AI:", error);
        return NextResponse.json({ error: 'Errore durante la generazione del piano con IA' }, { status: 500 });
    }
}
