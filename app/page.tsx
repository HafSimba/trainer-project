import Link from "next/link";
import { Activity, Apple, ArrowRight, Clock, Sparkles, Utensils, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { COLLECTIONS, getCollection } from "@/lib/mongodb";
import { PROTOTYPE_USER_ID } from "@/lib/config/user";
import type { DailyLog, UserProfile, WorkoutDay } from "@/lib/types/database";

const DAYS_OF_WEEK = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const DEFAULT_TARGET_CALORIES = 2000;

export const revalidate = 0;

type DailySummary = {
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
};

type NextMeal = {
    name: string;
    foods: string[];
} | null;

type DashboardData = {
    profile: UserProfile | null;
    dailySummary: DailySummary;
    currentDayName: string;
    workoutToday: WorkoutDay | null;
    nextMeal: NextMeal;
};

function safeNumber(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildDailySummary(log: DailyLog | null): DailySummary {
    return {
        calories: Math.max(0, safeNumber(log?.daily_nutrition_summary?.total_calories)),
        proteins: Math.max(0, safeNumber(log?.daily_nutrition_summary?.total_proteins_g)),
        carbs: Math.max(0, safeNumber(log?.daily_nutrition_summary?.total_carbs_g)),
        fats: Math.max(0, safeNumber(log?.daily_nutrition_summary?.total_fats_g)),
    };
}

function resolveNextMeal(
    meals: UserProfile["diet_plan"]["weekly_schedule"][number]["meals"] | undefined
): NextMeal {
    if (!meals) {
        return null;
    }

    const hour = new Date().getHours();
    if (hour < 11 && Array.isArray(meals.colazione) && meals.colazione.length > 0) {
        return { name: "Colazione", foods: meals.colazione };
    }

    if (hour < 15 && Array.isArray(meals.pranzo) && meals.pranzo.length > 0) {
        return { name: "Pranzo", foods: meals.pranzo };
    }

    if (hour < 19 && Array.isArray(meals.snack) && meals.snack.length > 0) {
        return { name: "Snack / Merenda", foods: meals.snack };
    }

    if (Array.isArray(meals.cena) && meals.cena.length > 0) {
        return { name: "Cena", foods: meals.cena };
    }

    return { name: "Fine Giornata", foods: ["Ottimo lavoro per oggi!"] };
}

async function loadDashboardData(): Promise<DashboardData> {
    const currentDayName = DAYS_OF_WEEK[new Date().getDay()];
    const todayString = new Date().toISOString().split("T")[0];

    try {
        const [dailyLogsCollection, profilesCollection] = await Promise.all([
            getCollection<DailyLog>(COLLECTIONS.dailyLogs),
            getCollection<UserProfile>(COLLECTIONS.userProfiles),
        ]);

        const [log, profile] = await Promise.all([
            dailyLogsCollection.findOne({ userId: PROTOTYPE_USER_ID, date: todayString }),
            profilesCollection.findOne({ userId: PROTOTYPE_USER_ID }),
        ]);

        const workoutToday = profile?.workout_plan?.schedule?.find(
            (scheduleDay) => (scheduleDay.day_name || "").toLowerCase() === currentDayName.toLowerCase()
        ) || null;

        const todaysDiet = profile?.diet_plan?.weekly_schedule?.find(
            (dietDay) => (dietDay.day_name || "").toLowerCase() === currentDayName.toLowerCase()
        );

        return {
            profile: profile || null,
            dailySummary: buildDailySummary(log),
            currentDayName,
            workoutToday,
            nextMeal: resolveNextMeal(todaysDiet?.meals),
        };
    } catch (error) {
        console.error("Dashboard load error:", error);

        return {
            profile: null,
            dailySummary: {
                calories: 0,
                proteins: 0,
                carbs: 0,
                fats: 0,
            },
            currentDayName,
            workoutToday: null,
            nextMeal: null,
        };
    }
}

export default async function Dashboard() {
    const { profile, dailySummary, currentDayName, workoutToday, nextMeal } = await loadDashboardData();
    const targetCal = Math.max(1, profile?.targets?.daily_calories || DEFAULT_TARGET_CALORIES);
    const progressPercent = Math.min((dailySummary.calories / targetCal) * 100, 100);

    if (!profile || !profile.workout_plan) {
        return (
            <main className="flex-1 px-6 py-10 pb-28 flex flex-col items-center justify-center gap-5 text-center">
                <div className="rounded-full bg-primary/12 p-4">
                    <Zap className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">Nessun Piano Attivo</h1>
                <p className="max-w-sm text-sm text-muted-foreground">Configura il profilo per generare un piano personalizzato di allenamento e nutrizione.</p>
                <Link href="/onboarding">
                    <Button className="h-10 px-6">Inizia ora</Button>
                </Link>
            </main>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-emerald-700 px-5 py-6 text-primary-foreground shadow-[0_16px_36px_-18px_rgba(27,100,67,0.75)]">
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
                <div className="absolute -left-12 -bottom-10 h-32 w-32 rounded-full bg-black/15 blur-2xl" />

                <div className="relative">
                    <p className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                        <Sparkles className="h-3.5 w-3.5" /> Focus del giorno
                    </p>
                    <h1 className="mt-3 text-3xl font-black capitalize">Oggi, {currentDayName}</h1>
                    <p className="mt-2 text-sm leading-relaxed text-primary-foreground/90">
                        Bentornato, {profile.name}. Hai una visione chiara di nutrizione, workout e prossimo pasto.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <Link href="/diary" className="block">
                            <Button variant="outline" className="h-10 w-full border-white/35 bg-white/10 text-white hover:bg-white/20">
                                Apri Diario <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="/profile" className="block">
                            <Button variant="outline" className="h-10 w-full border-white/35 bg-black/15 text-white hover:bg-black/25">
                                Piano completo
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <Card className="mt-4 border border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2"><Apple className="h-5 w-5 text-primary" /> Nutrizione</span>
                        <span className="text-sm font-normal text-muted-foreground">{Math.round(dailySummary.calories)} / {targetCal} kcal</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Progress aria-label="Progressione calorie giornaliere" value={progressPercent} className="mb-4 h-2.5 rounded-full bg-muted" />
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="rounded-xl border border-warning/25 bg-warning/10 p-2.5">
                            <p className="font-bold text-warning">{Math.round(dailySummary.carbs)}g</p>
                            <p className="mt-1 text-[11px] text-warning/90">Carbo ({profile.targets?.daily_carbs_g || 0}g)</p>
                        </div>
                        <div className="rounded-xl border border-success/25 bg-success/10 p-2.5">
                            <p className="font-bold text-success">{Math.round(dailySummary.proteins)}g</p>
                            <p className="mt-1 text-[11px] text-success/85">Pro ({profile.targets?.daily_protein_g || 0}g)</p>
                        </div>
                        <div className="rounded-xl border border-info/25 bg-info/10 p-2.5">
                            <p className="font-bold text-info">{Math.round(dailySummary.fats)}g</p>
                            <p className="mt-1 text-[11px] text-info/85">Grassi ({profile.targets?.daily_fats_g || 0}g)</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-4 grid gap-4">
                <Card className="border border-border/70 bg-gradient-to-br from-surface-soft via-surface-soft to-white shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between text-foreground">
                            <span className="flex items-center gap-2"><Activity className="h-5 w-5" /> Allenamento</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {workoutToday ? (
                            <>
                                <p className="mb-1 text-xl font-bold text-foreground">{workoutToday.workout_type}</p>
                                <p className="inline-block rounded-lg border border-primary/20 bg-primary/10 p-2 text-sm font-medium text-primary">
                                    {workoutToday.exercises?.length || 0} Esercizi previsti
                                </p>
                                <div className="mt-4 block">
                                    <Link href="/profile">
                                        <Button size="sm" className="shadow-sm">Vedi scheda</Button>
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <div className="py-2">
                                <p className="mb-1 text-xl font-bold text-foreground">Giorno di recupero</p>
                                <p className="text-sm text-muted-foreground">Nessuna sessione programmata. Ottimo momento per mobilita e sonno.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border border-border/70 bg-card shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between text-foreground">
                            <span className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Prossimo Pasto</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {nextMeal ? (
                            <>
                                <p className="mb-2 text-lg font-bold text-foreground">{nextMeal.name}</p>
                                <ul className="mb-4 space-y-2 rounded-lg border border-border bg-surface-soft/60 p-3">
                                    {nextMeal.foods.map((food, idx) => (
                                        <li key={idx} className="flex items-center gap-2 text-sm font-medium text-foreground">
                                            <Utensils className="h-4 w-4 shrink-0 text-primary" />
                                            {food}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="rounded-lg bg-surface-soft/70 p-3 text-sm text-muted-foreground">Nessun pasto in programma al momento o giornata finita.</p>
                        )}

                        <div className="mt-2 flex w-full gap-2">
                            <Link href="/diary" className="flex-1">
                                <Button size="sm" className="w-full shadow-sm">
                                    Aggiungi al Diario
                                </Button>
                            </Link>
                            <Link href="/profile" className="flex-1">
                                <Button size="sm" variant="outline" className="w-full border-border/90 bg-card hover:bg-surface-soft">
                                    Vedi Tutto
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}