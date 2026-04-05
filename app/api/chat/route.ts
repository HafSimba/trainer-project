import clientPromise, { COLLECTIONS, DATABASE_NAME } from "@/lib/mongodb";
import { cookies } from "next/headers";
import { USER_ID_COOKIE_NAME, resolveUserId } from "@/lib/config/user";
import { getChatModel, getLlmClient } from "@/lib/llm/client";

export const revalidate = 0;
export const fetchCache = 'force-no-store';

const DAYS_OF_WEEK = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const REPORT_KEYWORDS = /\b(report|recap|riepilogo|andamento|analisi|analizza|confronta|confronto|com[eè] andata|giornata)\b/i;

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
    role: ChatRole;
    content: string;
};

type UserTargets = {
    daily_calories?: number;
    daily_carbs_g?: number;
    daily_protein_g?: number;
    daily_fats_g?: number;
};

type WorkoutScheduleDay = {
    day_name?: string;
    workout_type?: string;
    exercises?: unknown[];
};

type UserProfileSnapshot = {
    name?: string;
    targets?: UserTargets;
    workout_plan?: {
        split_name?: string;
        schedule?: WorkoutScheduleDay[];
    };
};

type MealLogItem = {
    name?: string;
    calories?: number;
};

type TrainingLogItem = {
    type?: string;
    duration_minutes?: number;
};

type DailyNutritionSummary = {
    total_calories?: number;
    total_carbs_g?: number;
    total_proteins_g?: number;
    total_fats_g?: number;
};

type DailyLogSnapshot = {
    meals_log?: MealLogItem[];
    training_log?: TrainingLogItem[];
    daily_nutrition_summary?: DailyNutritionSummary;
};

type NutritionComparison = {
    targets: {
        calories: number;
        carbs: number;
        proteins: number;
        fats: number;
    };
    consumed: {
        calories: number;
        carbs: number;
        proteins: number;
        fats: number;
    };
    deltas: {
        calories: number;
        carbs: number;
        proteins: number;
        fats: number;
    };
    adherence: {
        calories: number;
        carbs: number;
        proteins: number;
        fats: number;
    };
    status: {
        calories: string;
        carbs: string;
        proteins: string;
        fats: string;
    };
    mealsCount: number;
};

type WorkoutComparison = {
    plannedType: string;
    plannedExercises: number;
    loggedSessionsText: string;
    status: string;
};

function normalizeChatRole(value: unknown): ChatRole {
    if (value === "assistant") return "assistant";
    if (value === "system") return "system";
    return "user";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

function sanitizeMessages(rawMessages: unknown): ChatMessage[] {
    if (!Array.isArray(rawMessages)) return [];

    return rawMessages
        .filter((message) => isRecord(message) && typeof message.content === "string" && typeof message.role === "string")
        .filter((message) => !message.content.includes("Impossibile contattare TrAIner"))
        .map((message) => ({
            role: normalizeChatRole(message.role),
            content: message.content,
        }));
}

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

function buildProfileContext(userProfile: UserProfileSnapshot | null): string {
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

function buildMealsContext(dailyLog: DailyLogSnapshot | null): string {
    const meals = Array.isArray(dailyLog?.meals_log) ? dailyLog.meals_log : [];
    if (meals.length === 0) return "Nessun pasto registrato oggi.";

    return meals
        .slice(-8)
        .map((meal) => `${meal.name || "Alimento"} (${Math.round(toNumber(meal.calories))} kcal)`)
        .join(", ");
}

function buildDailyNutritionComparison(
    userProfile: UserProfileSnapshot | null,
    dailyLog: DailyLogSnapshot | null
): NutritionComparison {
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

function buildWorkoutComparison(
    userProfile: UserProfileSnapshot | null,
    dailyLog: DailyLogSnapshot | null,
    currentDayName: string
): WorkoutComparison {
    const schedule = Array.isArray(userProfile?.workout_plan?.schedule)
        ? userProfile.workout_plan.schedule
        : [];

    const plannedWorkout = schedule.find((day) => normalizeForMatch(day?.day_name) === normalizeForMatch(currentDayName));
    const plannedType = plannedWorkout?.workout_type || "Riposo / nessuna seduta pianificata";
    const plannedExercises = Array.isArray(plannedWorkout?.exercises) ? plannedWorkout.exercises.length : 0;

    const loggedSessions = Array.isArray(dailyLog?.training_log) ? dailyLog.training_log : [];
    const loggedSessionsText = loggedSessions.length > 0
        ? loggedSessions.map((session) => {
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

async function fetchUserContext(today: string, userId: string): Promise<{
    userProfile: UserProfileSnapshot | null;
    dailyLog: DailyLogSnapshot | null;
}> {
    try {
        const mongoClient = await clientPromise;
        const db = mongoClient.db(DATABASE_NAME);

        const [userProfile, dailyLog] = await Promise.all([
            db.collection<UserProfileSnapshot>(COLLECTIONS.userProfiles).findOne({ userId }),
            db.collection<DailyLogSnapshot>(COLLECTIONS.dailyLogs).findOne({ userId, date: today }),
        ]);

        return { userProfile, dailyLog };
    } catch (dbError) {
        console.error("DB Fetch Error in Chat Route:", dbError);
        return { userProfile: null, dailyLog: null };
    }
}

function buildCalculatedReportContext(
    today: string,
    currentDayName: string,
    nutritionReport: NutritionComparison,
    mealsContextStr: string,
    workoutReport: WorkoutComparison
): string {
    return [
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
}

function buildSystemMessage(
    reportRequested: boolean,
    profileContextStr: string,
    calculatedReportContext: string
): ChatMessage {
    return {
        role: "system",
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
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as { messages?: unknown; userId?: unknown };
        const cookieStore = await cookies();
        const userIdFromCookie = cookieStore.get(USER_ID_COOKIE_NAME)?.value;
        const activeUserId = resolveUserId(body.userId, userIdFromCookie);
        const cleanMessages = sanitizeMessages(body.messages);
        const client = getLlmClient();
        const chatModel = getChatModel();

        if (cleanMessages.length === 0) {
            return Response.json({ content: "Scrivimi pure una domanda e ti rispondo subito." });
        }

        const today = new Date().toISOString().split('T')[0];
        const currentDayName = DAYS_OF_WEEK[new Date().getDay()];

        const { userProfile, dailyLog } = await fetchUserContext(today, activeUserId);

        const profileContextStr = buildProfileContext(userProfile);
        const mealsContextStr = buildMealsContext(dailyLog);
        const nutritionReport = buildDailyNutritionComparison(userProfile, dailyLog);
        const workoutReport = buildWorkoutComparison(userProfile, dailyLog, currentDayName);
        const reportRequested = shouldGenerateReport(cleanMessages);

        const calculatedReportContext = buildCalculatedReportContext(
            today,
            currentDayName,
            nutritionReport,
            mealsContextStr,
            workoutReport
        );

        const systemMessage = buildSystemMessage(reportRequested, profileContextStr, calculatedReportContext);

        const response = await client.chat.completions.create({
            model: chatModel,
            messages: [systemMessage, ...cleanMessages],
            stream: false,
            temperature: 0.3,
        });

        const replyContent = response.choices[0]?.message?.content || "Scusa, non sono riuscito a elaborare la risposta.";

        return Response.json({ content: replyContent });

    } catch (error) {
        console.error("AI API Error:", error);
        return new Response(JSON.stringify({ error: "Errore di connessione al modello AI Ollama." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
