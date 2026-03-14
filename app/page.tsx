'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Apple, Zap, Clock, Utensils } from "lucide-react";
import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PROTOTYPE_USER_ID = "tester-user-123";

// Mappiamo gli indici di JS ai giorni della settimana in Italiano usati dall'AI
const DAYS_OF_WEEK = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<any>(null);
    const [dailySummary, setDailySummary] = useState({
        calories: 0,
        proteins: 0,
        carbs: 0,
        fats: 0
    });

    const [currentDayName, setCurrentDayName] = useState("");
    const [workoutToday, setWorkoutToday] = useState<any>(null);
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

            const logsData = await logsRes.json();
            const profileData = await profileRes.json();

            // Setto le calorie consumate oggi rispetto al target
            if (logsData && logsData.daily_nutrition_summary) {
                setDailySummary({
                    calories: Math.max(0, logsData.daily_nutrition_summary.total_calories || 0),
                    proteins: Math.max(0, logsData.daily_nutrition_summary.total_proteins_g || 0),
                    carbs: Math.max(0, logsData.daily_nutrition_summary.total_carbs_g || 0),
                    fats: Math.max(0, logsData.daily_nutrition_summary.total_fats_g || 0)
                });
            }

            if (profileData && profileData.workout_plan) {
                setProfile(profileData);

                // 1. TROVA L'ALLENAMENTO DI OGGI
                const workout = profileData.workout_plan.schedule?.find(
                    (s: any) => s.day_name.toLowerCase() === currentDay.toLowerCase()
                );
                setWorkoutToday(workout || null);

                // 2. TROVA IL PROSSIMO PASTO IN BASE ALL'ORARIO E AL GIORNO ATTUALE
                if (profileData.diet_plan?.weekly_schedule) {
                    const todaysDiet = profileData.diet_plan.weekly_schedule.find(
                        (d: any) => d.day_name.toLowerCase() === currentDay.toLowerCase()
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
        return <div className="flex-1 p-6 flex items-center justify-center h-screen"><p className="text-gray-500 animate-pulse">Caricamento cruscotto odierno...</p></div>
    }

    // Se l'utente non ha mai generato un piano
    if (!profile || !profile.workout_plan) {
        return (
            <main className="flex-1 p-6 flex flex-col items-center justify-center gap-6 h-screen text-center">
                <Zap className="w-16 h-16 text-blue-300 mb-4" />
                <h1 className="text-2xl font-bold">Nessun Piano Attivo</h1>
                <p className="text-gray-500 max-w-sm">Configura il tuo profilo per far generare all'intelligenza artificiale la tua dieta e il tuo allenamento.</p>
                <Link href="/onboarding">
                    <Button className="bg-blue-600 hover:bg-blue-700">Inizia Ora</Button>
                </Link>
            </main>
        );
    }

    return (
        <main className="flex-1 p-6 flex flex-col gap-6 pt-10 pb-24 overflow-y-auto">
            <header className="mb-2">
                <h1 className="text-3xl font-black text-gray-900 capitalize">Oggi, {currentDayName}</h1>
                <p className="text-gray-500 mt-1 flex items-center gap-2">
                    Bentornato, {profile.name}! Ecco il recap di oggi.
                </p>
            </header>

            {/* RISCONTRO MACRONUTRIENTI (Loggati dal diario vs Target da Profilo) */}
            <Card className="shadow-sm border border-gray-100 bg-white">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2"><Apple className="h-5 w-5 text-green-600" /> Nutrizione</span>
                        <span className="text-sm font-normal text-gray-500">{Math.round(dailySummary.calories)} / {targetCal} kcal</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Progress value={progressPercent} className="h-3 mb-4 bg-gray-100" />
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="bg-orange-50 rounded p-2 border border-orange-100">
                            <p className="text-orange-700 font-bold">{Math.round(dailySummary.carbs)}g</p>
                            <p className="text-orange-500 text-xs mt-1">Carbo ({profile.targets?.daily_carbs_g || 0}g)</p>
                        </div>
                        <div className="bg-blue-50 rounded p-2 border border-blue-100">
                            <p className="text-blue-700 font-bold">{Math.round(dailySummary.proteins)}g</p>
                            <p className="text-blue-500 text-xs mt-1">Pro ({profile.targets?.daily_protein_g || 0}g)</p>
                        </div>
                        <div className="bg-yellow-50 rounded p-2 border border-yellow-100">
                            <p className="text-yellow-700 font-bold">{Math.round(dailySummary.fats)}g</p>
                            <p className="text-yellow-500 text-xs mt-1">Grassi ({profile.targets?.daily_fats_g || 0}g)</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {/* ALLENAMENTO QUOTIDIANO */}
                <Card className="shadow-sm border border-gray-100 bg-gradient-to-br from-blue-50 to-indigo-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between text-blue-800">
                            <span className="flex items-center gap-2"><Activity className="h-5 w-5" /> Allenamento</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {workoutToday ? (
                            <>
                                <p className="text-xl font-bold text-blue-900 mb-1">{workoutToday.workout_type}</p>
                                <p className="text-sm text-blue-700 font-medium bg-blue-100/50 p-2 rounded-lg inline-block">
                                    {workoutToday.exercises?.length || 0} Esercizi previsti
                                </p>
                                <div className="mt-4 block">
                                    <Link href="/profile">
                                        <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm">Vedi Scheda</Button>
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <div className="py-2">
                                <p className="text-xl font-bold text-blue-900 mb-1">Giorno di Riposo</p>
                                <p className="text-sm text-blue-700">Nessuna sessione programmata. Recupera!</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* DIETA: PROSSIMO PASTO */}
                <Card className="shadow-sm border border-gray-100 bg-gradient-to-br from-green-50 to-emerald-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between text-green-800">
                            <span className="flex items-center gap-2"><Clock className="h-5 w-5" /> Prossimo Pasto</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {nextMeal ? (
                            <>
                                <p className="text-lg font-bold text-green-900 mb-2">{nextMeal.name}</p>
                                <ul className="space-y-2 mb-4 bg-white/60 p-3 rounded-lg border border-green-100">
                                    {nextMeal.foods.map((food, idx) => (
                                        <li key={idx} className="text-sm text-green-900 flex items-center gap-2 font-medium">
                                            <Utensils className="w-4 h-4 text-green-600 shrink-0" />
                                            {food}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500 bg-white/60 p-3 rounded-lg">Nessun pasto in programma al momento o giornata finita.</p>
                        )}

                        <div className="flex gap-2 w-full mt-2">
                            <Link href="/diary" className="flex-1">
                                <Button size="sm" className="w-full bg-green-600 text-white hover:bg-green-700 shadow-sm">
                                    Aggiungi al Diario
                                </Button>
                            </Link>
                            <Link href="/profile" className="flex-1">
                                <Button size="sm" variant="outline" className="w-full border-green-200 text-green-800 hover:bg-green-100 bg-white">
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