import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { DailyLog } from '@/lib/types/database';

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
        const clampToZero = (value: number) => Math.max(0, value);

        // Funzione di utilità per ricalcolare i totali in modo sicuro (evita i negativi da doppi click)
        const recalculateTotals = (meals: DailyLog['meals_log']) => {
            return {
                total_calories: meals.reduce((sum, m) => sum + (m.calories || 0), 0),
                total_proteins_g: meals.reduce((sum, m) => sum + (m.proteins_g || 0), 0),
                total_carbs_g: meals.reduce((sum, m) => sum + (m.carbs_g || 0), 0),
                total_fats_g: meals.reduce((sum, m) => sum + (m.fats_g || 0), 0),
            };
        };

        if (action === 'add_meal' && meal) {
            // Per evitare race conditions e dati sballati, calcoliamo tutto prendendo il documento attuale
            const doc = await collection.findOne({ userId, date });
            const currentMeals = doc?.meals_log || [];
            const updatedMeals = [...currentMeals, meal];
            const totals = recalculateTotals(updatedMeals);

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
                    $set: {
                        meals_log: updatedMeals,
                        "daily_nutrition_summary.total_calories": totals.total_calories,
                        "daily_nutrition_summary.total_proteins_g": totals.total_proteins_g,
                        "daily_nutrition_summary.total_carbs_g": totals.total_carbs_g,
                        "daily_nutrition_summary.total_fats_g": totals.total_fats_g,
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return NextResponse.json({ success: true, log: updateResult });
        }

        if (action === 'delete_meal' && meal) {
            const doc = await collection.findOne({ userId, date });
            const currentMeals = doc?.meals_log || [];
            const updatedMeals = currentMeals.filter((m: any) => m.id !== meal.id);
            const totals = recalculateTotals(updatedMeals);

            const updateResult = await collection.findOneAndUpdate(
                { userId, date },
                {
                    $set: {
                        meals_log: updatedMeals,
                        "daily_nutrition_summary.total_calories": clampToZero(totals.total_calories),
                        "daily_nutrition_summary.total_proteins_g": clampToZero(totals.total_proteins_g),
                        "daily_nutrition_summary.total_carbs_g": clampToZero(totals.total_carbs_g),
                        "daily_nutrition_summary.total_fats_g": clampToZero(totals.total_fats_g),
                    }
                },
                { returnDocument: 'after' }
            );
            return NextResponse.json({ success: true, log: updateResult });
        }

        if (action === 'edit_meal' && meal) {
            const doc = await collection.findOne({ userId, date });
            const currentMeals = doc?.meals_log || [];
            const updatedMeals = currentMeals.map((m: any) => m.id === meal.id ? meal : m);
            const totals = recalculateTotals(updatedMeals);

            const updateResult = await collection.findOneAndUpdate(
                { userId, date },
                {
                    $set: {
                        meals_log: updatedMeals,
                        "daily_nutrition_summary.total_calories": clampToZero(totals.total_calories),
                        "daily_nutrition_summary.total_proteins_g": clampToZero(totals.total_proteins_g),
                        "daily_nutrition_summary.total_carbs_g": clampToZero(totals.total_carbs_g),
                        "daily_nutrition_summary.total_fats_g": clampToZero(totals.total_fats_g),
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
