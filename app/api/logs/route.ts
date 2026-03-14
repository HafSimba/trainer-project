import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { DailyLog, Meal } from '@/lib/types/database';

// POST: Aggiunge un pasto al log giornaliero dell'utente
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, date, meal } = body as { userId: string; date: string; meal: Meal };

        if (!userId || !date || !meal) {
            return NextResponse.json({ error: 'Mancano campi obbligatori (userId, date, meal)' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db('trainer_db');
        const collection = db.collection<DailyLog>('daily_logs');

        // Trova il documento giornaliero o crea le chiavi se non esiste usando l'upsert
        // In questo modo usiamo un "Documento Denso"
        const updateResult = await collection.findOneAndUpdate(
            { userId, date },
            {
                $setOnInsert: {
                    userId,
                    date,
                    metrics: {},
                    training_log: []
                },
                $push: { meals_log: meal },
                $inc: {
                    "daily_nutrition_summary.total_calories": meal.calories,
                    "daily_nutrition_summary.total_proteins_g": meal.proteins_g,
                    "daily_nutrition_summary.total_carbs_g": meal.carbs_g,
                    "daily_nutrition_summary.total_fats_g": meal.fats_g,
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        return NextResponse.json({ success: true, log: updateResult });
    } catch (error: any) {
        console.error("Errore API Logs:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}

// GET: Recupera il log giornaliero intero o la sintesi
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const date = searchParams.get('date'); // Opzionale. Se non fornito, può restituire uno storico

        if (!userId) {
            return NextResponse.json({ error: 'Il parametro userId è obbligatorio' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db('trainer_db');
        const collection = db.collection<DailyLog>('daily_logs');

        if (date) {
            const log = await collection.findOne({ userId, date });
            return NextResponse.json(log || { message: "Nessun dato per la data specificata." });
        } else {
            // Ritorna gli ultimi 7 giorni come cronologia per l'AI
            const logs = await collection.find({ userId })
                .sort({ date: -1 })
                .limit(7)
                .toArray();
            return NextResponse.json(logs);
        }
    } catch (error: any) {
        console.error("Errore GET Logs:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}