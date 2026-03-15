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
const DAYS_OF_WEEK = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const REPORT_KEYWORDS = /\b(report|recap|riepilogo|andamento|analisi|analizza|confronta|confronto|com[eè] andata|giornata)\b/i;

type ChatMessage = {
    role: "user" | "assistant" | "system";
    content: string;
};

function toNumber(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeForMatch(value: unknown): string {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function evaluateTargetStatus(consumed: number, target: number): string {
    if (target <= 0) return "dato non disponibile";
    const lowerBound = target * 0.9;
    const upperBound = target * 1.1;
    if (consumed < lowerBound) return "sotto target";
    if (consumed > upperBound) return "sopra target";
    return "in target";
}

function safePercentage(consumed: number, target: number): number {
    if (target <= 0) return 0;
    return Math.round((consumed / target) * 100);
}

function formatSigned(value: number): string {
    if (value > 0) return `+${value}`;
    return `${value}`;
}

function shouldGenerateReport(messages: ChatMessage[]): boolean {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    return REPORT_KEYWORDS.test(lastUserMessage.toLowerCase());
}

function buildProfileContext(userProfile: any): string {
    if (!userProfile) {
        return "PROFILO UTENTE: non disponibile. Invita l'utente a completare l'onboarding se chiede piano/target personalizzati.";
    }

    return [
        "PROFILO UTENTE:",
        `Nome: ${userProfile.name || "Utente"}`,
        `Target kcal: ${Math.round(toNumber(userProfile.targets?.daily_calories))}`,
        `Target carbo: ${Math.round(toNumber(userProfile.targets?.daily_carbs_g))}g`,
        `Target proteine: ${Math.round(toNumber(userProfile.targets?.daily_protein_g))}g`,
        `Target grassi: ${Math.round(toNumber(userProfile.targets?.daily_fats_g))}g`,
        `Split allenamento: ${userProfile.workout_plan?.split_name || "Non specificato"}`,
    ].join("\n");
}

function buildMealsContext(dailyLog: any): string {
    const meals = Array.isArray(dailyLog?.meals_log) ? dailyLog.meals_log : [];
    if (meals.length === 0) return "Nessun pasto registrato oggi.";

    return meals
        .slice(-8)
        .map((meal: any) => `${meal.name || "Alimento"} (${Math.round(toNumber(meal.calories))} kcal)`)
        .join(", ");
}

function buildDailyNutritionComparison(userProfile: any, dailyLog: any) {
    const targets = {
        calories: Math.round(toNumber(userProfile?.targets?.daily_calories)),
        carbs: Math.round(toNumber(userProfile?.targets?.daily_carbs_g)),
        proteins: Math.round(toNumber(userProfile?.targets?.daily_protein_g)),
        fats: Math.round(toNumber(userProfile?.targets?.daily_fats_g)),
    };

    const consumed = {
        calories: Math.round(toNumber(dailyLog?.daily_nutrition_summary?.total_calories)),
        carbs: Math.round(toNumber(dailyLog?.daily_nutrition_summary?.total_carbs_g)),
        proteins: Math.round(toNumber(dailyLog?.daily_nutrition_summary?.total_proteins_g)),
        fats: Math.round(toNumber(dailyLog?.daily_nutrition_summary?.total_fats_g)),
    };

    const deltas = {
        calories: consumed.calories - targets.calories,
        carbs: consumed.carbs - targets.carbs,
        proteins: consumed.proteins - targets.proteins,
        fats: consumed.fats - targets.fats,
    };

    const adherence = {
        calories: safePercentage(consumed.calories, targets.calories),
        carbs: safePercentage(consumed.carbs, targets.carbs),
        proteins: safePercentage(consumed.proteins, targets.proteins),
        fats: safePercentage(consumed.fats, targets.fats),
    };

    const status = {
        calories: evaluateTargetStatus(consumed.calories, targets.calories),
        carbs: evaluateTargetStatus(consumed.carbs, targets.carbs),
        proteins: evaluateTargetStatus(consumed.proteins, targets.proteins),
        fats: evaluateTargetStatus(consumed.fats, targets.fats),
    };

    const mealsCount = Array.isArray(dailyLog?.meals_log) ? dailyLog.meals_log.length : 0;

    return {
        targets,
        consumed,
        deltas,
        adherence,
        status,
        mealsCount,
    };
}

function buildWorkoutComparison(userProfile: any, dailyLog: any, currentDayName: string) {
    const schedule = Array.isArray(userProfile?.workout_plan?.schedule)
        ? userProfile.workout_plan.schedule
        : [];

    const plannedWorkout = schedule.find((day: any) => normalizeForMatch(day?.day_name) === normalizeForMatch(currentDayName));
    const plannedType = plannedWorkout?.workout_type || "Riposo / nessuna seduta pianificata";
    const plannedExercises = Array.isArray(plannedWorkout?.exercises) ? plannedWorkout.exercises.length : 0;

    const loggedSessions = Array.isArray(dailyLog?.training_log) ? dailyLog.training_log : [];
    const loggedSessionsText = loggedSessions.length > 0
        ? loggedSessions.map((session: any) => {
            const duration = Math.round(toNumber(session?.duration_minutes));
            return `${session?.type || "Sessione"} (${duration} min)`;
        }).join(", ")
        : "Nessuna sessione registrata nel diario";

    let status = "Riposo";
    if (plannedWorkout && loggedSessions.length === 0) {
        status = "Allenamento pianificato ma non registrato";
    } else if (plannedWorkout && loggedSessions.length > 0) {
        status = "Allenamento registrato";
    } else if (!plannedWorkout && loggedSessions.length > 0) {
        status = "Allenamento extra registrato";
    }

    return {
        plannedType,
        plannedExercises,
        loggedSessionsText,
        status,
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

        const cleanMessages: ChatMessage[] = rawMessages
            .filter((message: any) => typeof message?.content === "string" && typeof message?.role === "string")
            .filter((message: any) => !message.content.includes("Impossibile contattare TrAIner"))
            .map((message: any) => ({
                role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
                content: message.content,
            }));

        if (cleanMessages.length === 0) {
            return Response.json({ content: "Scrivimi pure una domanda e ti rispondo subito." });
        }

        const today = new Date().toISOString().split('T')[0];
        const currentDayName = DAYS_OF_WEEK[new Date().getDay()];

        let userProfile: any = null;
        let dailyLog: any = null;

        try {
            const mongoClient = await clientPromise;
            const db = mongoClient.db("trainer_db");

            [userProfile, dailyLog] = await Promise.all([
                db.collection("user_profiles").findOne({ userId: PROTOTYPE_USER_ID }),
                db.collection("daily_logs").findOne({ userId: PROTOTYPE_USER_ID, date: today }),
            ]);
        } catch (dbError) {
            console.error("DB Fetch Error in Chat Route:", dbError);
        }

        const profileContextStr = buildProfileContext(userProfile);
        const mealsContextStr = buildMealsContext(dailyLog);
        const nutritionReport = buildDailyNutritionComparison(userProfile, dailyLog);
        const workoutReport = buildWorkoutComparison(userProfile, dailyLog, currentDayName);
        const reportRequested = shouldGenerateReport(cleanMessages);

        const calculatedReportContext = [
            `REPORT GIORNALIERO CALCOLATO (${today}):`,
            `TARGET -> kcal: ${nutritionReport.targets.calories}, carbo: ${nutritionReport.targets.carbs}g, proteine: ${nutritionReport.targets.proteins}g, grassi: ${nutritionReport.targets.fats}g`,
            `CONSUMATI -> kcal: ${nutritionReport.consumed.calories}, carbo: ${nutritionReport.consumed.carbs}g, proteine: ${nutritionReport.consumed.proteins}g, grassi: ${nutritionReport.consumed.fats}g`,
            `SCOSTAMENTI -> kcal: ${formatSigned(nutritionReport.deltas.calories)}, carbo: ${formatSigned(nutritionReport.deltas.carbs)}g, proteine: ${formatSigned(nutritionReport.deltas.proteins)}g, grassi: ${formatSigned(nutritionReport.deltas.fats)}g`,
            `ADERENZA -> kcal: ${nutritionReport.adherence.calories}%, carbo: ${nutritionReport.adherence.carbs}%, proteine: ${nutritionReport.adherence.proteins}%, grassi: ${nutritionReport.adherence.fats}%`,
            `ESITO NUTRIZIONE -> kcal: ${nutritionReport.status.calories}, carbo: ${nutritionReport.status.carbs}, proteine: ${nutritionReport.status.proteins}, grassi: ${nutritionReport.status.fats}`,
            `PASTI REGISTRATI (${nutritionReport.mealsCount}) -> ${mealsContextStr}`,
            `ALLENAMENTO PIANIFICATO OGGI (${currentDayName}) -> ${workoutReport.plannedType} (${workoutReport.plannedExercises} esercizi)`,
            `ALLENAMENTO REGISTRATO -> ${workoutReport.loggedSessionsText}`,
            `ESITO ALLENAMENTO -> ${workoutReport.status}`,
        ].join("\n");

        const systemMessage = {
            role: "system" as const,
            content: [
                "Sei TrAIner, personal trainer e nutrizionista AI.",
                "Rispondi in italiano in modo chiaro, concreto e sintetico.",
                "Quando parli di report o giudizi giornalieri usa i numeri del blocco 'REPORT GIORNALIERO CALCOLATO' senza inventare dati.",
                "Se mancano dati, dichiaralo esplicitamente come 'dato non disponibile'.",
                `REPORT_RICHIESTO_DALL_UTENTE: ${reportRequested ? "SI" : "NO"}`,
                "Se REPORT_RICHIESTO_DALL_UTENTE = SI, rispondi SEMPRE con questa struttura:",
                "1) Stato nutrizione", 
                "2) Confronto numerico vs target", 
                "3) Allenamento di oggi", 
                "4) Esito finale (corretto/non corretto + motivazione)", 
                "5) Azioni pratiche immediate (max 3)",
                profileContextStr,
                calculatedReportContext,
            ].join("\n\n"),
        };

        const response = await client.chat.completions.create({
            model: "nvidia/nemotron-nano-12b-v2-vl:free",
            messages: [systemMessage, ...cleanMessages],
            stream: false,
            temperature: 0.3,
        });

        const replyContent = response.choices[0]?.message?.content || "Scusa, non sono riuscito a elaborare la risposta.";

        return Response.json({ content: replyContent });

    } catch (error) {
        console.error("AI API Error:", error);
        return new Response(JSON.stringify({ error: "Errore di connessione al modello AI OpenRouter." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
