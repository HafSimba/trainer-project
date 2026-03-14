import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { DailyLog, Meal } from '@/lib/types/database';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, date, action = 'add_meal', meal, water_ml } = body;

        if (!userId || !date) {
            return NextResponse.json({ error: 'Mancano campi obbligatori (userId, date)' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db('trainer_db');
        const collection = db.collection<DailyLog>('daily_logs');

        if (action === 'add_meal' && meal) {
            const updateResult = await collection.findOneAndUpdate(
                { userId, date },
                {
                    $setOnInsert: {
                        userId,
                        date,
                        metrics: {},
                        training_log: [],
                        "daily_nutrition_summary.water_intake_ml": 0
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
        }

        if (action === 'delete_meal' && meal) {
            const updateResult = await collection.findOneAndUpdate(
                { userId, date },
                {
                    $pull: { meals_log: { id: meal.id } },
                    $inc: {
                        "daily_nutrition_summary.total_calories": -meal.calories,
                        "daily_nutrition_summary.total_proteins_g": -meal.proteins_g,
                        "daily_nutrition_summary.total_carbs_g": -meal.carbs_g,
                        "daily_nutrition_summary.total_fats_g": -meal.fats_g,
                    }
                },
                { returnDocument: 'after' }
            );
            return NextResponse.json({ success: true, log: updateResult });
        }

        if (action === 'edit_meal' && meal && body.old_meal) {
            const { old_meal } = body;
            const updateResult = await collection.findOneAndUpdate(
                { userId, date, "meals_log.id": meal.id },
                {
                    $set: { "meals_log.$": meal },
                    $inc: {
                        "daily_nutrition_summary.total_calories": meal.calories - old_meal.calories,
                        "daily_nutrition_summary.total_proteins_g": meal.proteins_g - old_meal.proteins_g,
                        "daily_nutrition_summary.total_carbs_g": meal.carbs_g - old_meal.carbs_g,
                        "daily_nutrition_summary.total_fats_g": meal.fats_g - old_meal.fats_g,
                    }
                },
                { returnDocument: 'after' }
            );
            return NextResponse.json({ success: true, log: updateResult });
        }

        if (action === 'update_water' && water_ml !== undefined) {
             const updateResult = await collection.findOneAndUpdate(
                { userId, date },
                {
                    $setOnInsert: {
                        userId,
                        date,
                        metrics: {},
                        training_log: [],
                        meals_log: [],
                        "daily_nutrition_summary.total_calories": 0,
                        "daily_nutrition_summary.total_proteins_g": 0,
                        "daily_nutrition_summary.total_carbs_g": 0,
                        "daily_nutrition_summary.total_fats_g": 0,
                    },
                    $set: {
                        "daily_nutrition_summary.water_intake_ml": water_ml
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return NextResponse.json({ success: true, log: updateResult });
        }

        return NextResponse.json({ error: 'Azione non valida o dati mancanti' }, { status: 400 });

    } catch (error: any) {
        console.error("Errore API Logs:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const date = searchParams.get('date');

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
