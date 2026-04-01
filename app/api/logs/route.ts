import { NextResponse } from 'next/server';
import { COLLECTIONS, getCollection } from '@/lib/mongodb';
import { DailyLog } from '@/lib/types/database';

type LogAction = 'add_meal' | 'add_meals' | 'delete_meal' | 'edit_meal' | 'update_water';

type LogRequestBody = {
    userId?: string;
    date?: string;
    action?: LogAction;
    meal?: DailyLog['meals_log'][number];
    meals?: DailyLog['meals_log'];
    water_ml?: number;
};

type MealLog = DailyLog['meals_log'];

type AppendMealsParams = {
    collection: Awaited<ReturnType<typeof getDailyLogsCollection>>;
    userId: string;
    date: string;
    mealsToAppend: MealLog;
};

type AtomicMealsUpdateParams = {
    collection: Awaited<ReturnType<typeof getDailyLogsCollection>>;
    userId: string;
    date: string;
    mealsExpression: Record<string, unknown>;
    clampTotals: boolean;
};

function safeNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function calculateMealsDelta(meals: MealLog) {
    return meals.reduce(
        (acc, item) => {
            acc.total_calories += safeNumber(item.calories);
            acc.total_proteins_g += safeNumber(item.proteins_g);
            acc.total_carbs_g += safeNumber(item.carbs_g);
            acc.total_fats_g += safeNumber(item.fats_g);
            return acc;
        },
        {
            total_calories: 0,
            total_proteins_g: 0,
            total_carbs_g: 0,
            total_fats_g: 0,
        }
    );
}

function buildSumMealsFieldExpression(field: 'calories' | 'proteins_g' | 'carbs_g' | 'fats_g') {
    return {
        $sum: {
            $map: {
                input: { $ifNull: ['$meals_log', []] },
                as: 'meal',
                in: { $ifNull: [`$$meal.${field}`, 0] },
            },
        },
    };
}

function totalsFromCurrentMealsSet(clampTotals: boolean) {
    const valueExpression = (field: 'calories' | 'proteins_g' | 'carbs_g' | 'fats_g') => {
        const sumExpression = buildSumMealsFieldExpression(field);
        return clampTotals ? { $max: [0, sumExpression] } : sumExpression;
    };

    return {
        "daily_nutrition_summary.total_calories": valueExpression('calories'),
        "daily_nutrition_summary.total_proteins_g": valueExpression('proteins_g'),
        "daily_nutrition_summary.total_carbs_g": valueExpression('carbs_g'),
        "daily_nutrition_summary.total_fats_g": valueExpression('fats_g'),
    };
}

function mealActionsSetOnInsert(userId: string, date: string) {
    return {
        userId,
        date,
        metrics: {},
        training_log: [],
        "daily_nutrition_summary.water_intake_ml": 0,
    };
}

function waterActionSetOnInsert(userId: string, date: string) {
    return {
        userId,
        date,
        metrics: {},
        training_log: [],
        meals_log: [],
        "daily_nutrition_summary.total_calories": 0,
        "daily_nutrition_summary.total_proteins_g": 0,
        "daily_nutrition_summary.total_carbs_g": 0,
        "daily_nutrition_summary.total_fats_g": 0,
    };
}

async function getDailyLogsCollection() {
    return getCollection<DailyLog>(COLLECTIONS.dailyLogs);
}

function successLogResponse(updateResult: unknown) {
    return NextResponse.json({ success: true, log: updateResult });
}

async function updateMealsAndTotalsAtomically({
    collection,
    userId,
    date,
    mealsExpression,
    clampTotals,
}: AtomicMealsUpdateParams) {
    const updatePipeline = [
        {
            $set: {
                meals_log: mealsExpression,
            },
        },
        {
            $set: {
                ...totalsFromCurrentMealsSet(clampTotals),
            },
        },
    ] as Array<Record<string, unknown>>;

    const updateResult = await collection.findOneAndUpdate(
        { userId, date },
        updatePipeline,
        { returnDocument: 'after' }
    );

    return successLogResponse(updateResult);
}

async function appendMealsAndIncrementTotals({
    collection,
    userId,
    date,
    mealsToAppend,
}: AppendMealsParams) {
    const delta = calculateMealsDelta(mealsToAppend);

    const updateResult = await collection.findOneAndUpdate(
        { userId, date },
        {
            $setOnInsert: mealActionsSetOnInsert(userId, date),
            $push: {
                meals_log: { $each: mealsToAppend },
            },
            $inc: {
                "daily_nutrition_summary.total_calories": delta.total_calories,
                "daily_nutrition_summary.total_proteins_g": delta.total_proteins_g,
                "daily_nutrition_summary.total_carbs_g": delta.total_carbs_g,
                "daily_nutrition_summary.total_fats_g": delta.total_fats_g,
            },
        },
        { upsert: true, returnDocument: 'after' }
    );

    return successLogResponse(updateResult);
}

function missingParamsError() {
    return NextResponse.json({ error: 'Mancano campi obbligatori (userId, date)' }, { status: 400 });
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as LogRequestBody;
        const { userId, date, action = 'add_meal', meal, meals, water_ml } = body;

        if (!userId || !date) {
            return missingParamsError();
        }

        const collection = await getDailyLogsCollection();

        switch (action) {
            case 'add_meal': {
                if (!meal) break;
                return appendMealsAndIncrementTotals({
                    collection,
                    userId,
                    date,
                    mealsToAppend: [meal],
                });
            }
            case 'add_meals': {
                if (!Array.isArray(meals) || meals.length === 0) break;
                return appendMealsAndIncrementTotals({
                    collection,
                    userId,
                    date,
                    mealsToAppend: meals,
                });
            }
            case 'delete_meal': {
                if (!meal) break;
                return updateMealsAndTotalsAtomically({
                    collection,
                    userId,
                    date,
                    mealsExpression: {
                        $filter: {
                            input: { $ifNull: ['$meals_log', []] },
                            as: 'meal',
                            cond: { $ne: ['$$meal.id', meal.id] },
                        },
                    },
                    clampTotals: true,
                });
            }
            case 'edit_meal': {
                if (!meal) break;
                return updateMealsAndTotalsAtomically({
                    collection,
                    userId,
                    date,
                    mealsExpression: {
                        $map: {
                            input: { $ifNull: ['$meals_log', []] },
                            as: 'meal',
                            in: {
                                $cond: [
                                    { $eq: ['$$meal.id', meal.id] },
                                    meal,
                                    '$$meal',
                                ],
                            },
                        },
                    },
                    clampTotals: true,
                });
            }
            case 'update_water': {
                if (water_ml === undefined) break;
                const updateResult = await collection.findOneAndUpdate(
                    { userId, date },
                    {
                        $setOnInsert: waterActionSetOnInsert(userId, date),
                        $set: {
                            "daily_nutrition_summary.water_intake_ml": water_ml,
                        },
                    },
                    { upsert: true, returnDocument: 'after' }
                );

                return successLogResponse(updateResult);
            }
            default:
                break;
        }

        return NextResponse.json({ error: 'Azione non valida o dati mancanti' }, { status: 400 });

    } catch (error: unknown) {
        console.error("Errore API Logs:", error);

        const detail = error instanceof Error ? error.message : String(error);
        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json({ error: detail || 'Errore interno del server' }, { status: 500 });
        }

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

        const collection = await getDailyLogsCollection();

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
    } catch (error: unknown) {
        console.error("Errore GET Logs:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}
