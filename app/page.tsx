'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Apple, ArrowRight, Clock, Sparkles, Utensils, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PROTOTYPE_USER_ID } from "@/lib/config/user";
import { extractApiError, readJsonResponse } from "@/lib/utils";

// Mappiamo gli indici di JS ai giorni della settimana in Italiano usati dall'AI
const DAYS_OF_WEEK = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

type DailySummary = {
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
};

type DashboardWorkoutDay = {
    day_name?: string;
    workout_type?: string;
    exercises?: unknown[];
};

type DashboardDietMeals = {
    colazione?: string[];
    pranzo?: string[];
    snack?: string[];
    cena?: string[];
};

type DashboardProfile = {
    name?: string;
    targets?: {
        daily_calories?: number;
        daily_carbs_g?: number;
        daily_protein_g?: number;
        daily_fats_g?: number;
    };
    workout_plan?: {
        schedule?: DashboardWorkoutDay[];
    };
    diet_plan?: {
        weekly_schedule?: Array<{
            day_name?: string;
            meals?: DashboardDietMeals;
        }>;
    };
};

type LogsResponse = {
    daily_nutrition_summary?: {
        total_calories?: number;
        total_proteins_g?: number;
        total_carbs_g?: number;
        total_fats_g?: number;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

function isDashboardProfile(value: unknown): value is DashboardProfile {
    return isRecord(value) && ("workout_plan" in value || "targets" in value || "name" in value || "diet_plan" in value);
}

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<DashboardProfile | null>(null);
    const [dailySummary, setDailySummary] = useState<DailySummary>({
        calories: 0,
        proteins: 0,
        carbs: 0,
        fats: 0
    });

    const [currentDayName, setCurrentDayName] = useState("");
    const [workoutToday, setWorkoutToday] = useState<DashboardWorkoutDay | null>(null);
    const [nextMeal, setNextMeal] = useState<{ name: string, foods: string[] } | null>(null);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const todayString = new Date().toISOString().split('T')[0];
            const dayIndex = new Date().getDay();
            const currentDay = DAYS_OF_WEEK[dayIndex];
            setCurrentDayName(currentDay);

            // Chiamate parallele: recupera quello che ho mangiato e l'intera scheda/dieta
            const [logsRes, profileRes] = await Promise.all([
                fetch('/api/logs?userId=' + PROTOTYPE_USER_ID + '&date=' + todayString),
                fetch('/api/profile?userId=' + PROTOTYPE_USER_ID)
            ]);

            const [logsData, profileData] = await Promise.all([
                readJsonResponse<LogsResponse>(logsRes),
                readJsonResponse<unknown>(profileRes)
            ]);

            if (!logsRes.ok || !profileRes.ok) {
                throw new Error(
                    extractApiError(logsData)
                    || extractApiError(profileData)
                    || 'Errore nel recupero dei dati dashboard.'
                );
            }

            // Setto le calorie consumate oggi rispetto al target
            if (logsData?.daily_nutrition_summary) {
                setDailySummary({
                    calories: Math.max(0, logsData.daily_nutrition_summary.total_calories || 0),
                    proteins: Math.max(0, logsData.daily_nutrition_summary.total_proteins_g || 0),
                    carbs: Math.max(0, logsData.daily_nutrition_summary.total_carbs_g || 0),
                    fats: Math.max(0, logsData.daily_nutrition_summary.total_fats_g || 0)
                });
            }

            if (isDashboardProfile(profileData) && profileData.workout_plan) {
                setProfile(profileData);

                // 1. TROVA L'ALLENAMENTO DI OGGI
                const workout = profileData.workout_plan.schedule?.find(
                    (scheduleDay) => (scheduleDay.day_name || "").toLowerCase() === currentDay.toLowerCase()
                );
                setWorkoutToday(workout || null);

                // 2. TROVA IL PROSSIMO PASTO IN BASE ALL'ORARIO E AL GIORNO ATTUALE
                if (profileData.diet_plan?.weekly_schedule) {
                    const todaysDiet = profileData.diet_plan.weekly_schedule.find(
                        (dietDay) => (dietDay.day_name || "").toLowerCase() === currentDay.toLowerCase()
                    );

                    if (todaysDiet && todaysDiet.meals) {
                        const hour = new Date().getHours();
                        let mealName = "";
                        let foods: string[] = [];

                        if (hour < 11 && todaysDiet.meals.colazione) {
                            mealName = "Colazione";
                            foods = todaysDiet.meals.colazione;
                        } else if (hour < 15 && todaysDiet.meals.pranzo) {
                            mealName = "Pranzo";
                            foods = todaysDiet.meals.pranzo;
                        } else if (hour < 19 && todaysDiet.meals.snack) {
                            mealName = "Snack / Merenda";
                            foods = todaysDiet.meals.snack;
                        } else if (todaysDiet.meals.cena) {
                            mealName = "Cena";
                            foods = todaysDiet.meals.cena;
                        } else {
                            mealName = "Fine Giornata";
                            foods = ["Ottimo lavoro per oggi!"];
                        }

                        if (mealName && foods.length > 0) {
                            setNextMeal({ name: mealName, foods });
                        }
                    }
                }
            }

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    const targetCal = profile?.targets?.daily_calories || 2000;
    const progressPercent = Math.min((dailySummary.calories / targetCal) * 100, 100);

    if (loading) {
        return (
            <main className="flex-1 px-5 py-7 pb-28">
                <div className="animate-pulse space-y-4">
                    <div className="h-40 rounded-3xl bg-muted" />
                    <div className="h-28 rounded-2xl bg-muted/80" />
                    <div className="h-36 rounded-2xl bg-muted/80" />
                </div>
            </main>
        );
    }

    // Se l'utente non ha mai generato un piano
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
                    <Progress value={progressPercent} className="mb-4 h-2.5 rounded-full bg-muted" />
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