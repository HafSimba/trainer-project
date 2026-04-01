'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell } from "recharts";
import { Plus, Droplets, Trash2, Loader2, Pencil, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PROTOTYPE_USER_ID } from "@/lib/config/user";
import { extractApiError, getTodayDate, readJsonResponse } from "@/lib/utils";
import type { DailyLog, Meal } from "@/lib/types/database";

const DEFAULT_DAILY_CALORIE_GOAL = 2400;

type MealType = 'colazione' | 'pranzo' | 'cena' | 'snack';
type EditMacros = { calories: number; carbs_g: number; proteins_g: number; fats_g: number };
type ProfileApiResponse = { targets?: { daily_calories?: number } };
type ApiErrorResponse = { error?: string; message?: string };

const DEFAULT_EDIT_MACROS: EditMacros = { calories: 0, carbs_g: 0, proteins_g: 0, fats_g: 0 };
const MEAL_SECTIONS: Array<{ type: MealType; title: string; helper: string }> = [
  { type: 'colazione', title: 'Colazione', helper: 'Inizia la giornata con energia stabile.' },
  { type: 'pranzo', title: 'Pranzo', helper: 'Pasto centrale per performance e recupero.' },
  { type: 'cena', title: 'Cena', helper: 'Chiusura nutrizionale della giornata.' },
  { type: 'snack', title: 'Snack', helper: 'Spuntini strategici tra i pasti principali.' },
];

function createEmptyDailyLog(): DailyLog {
  return {
    userId: PROTOTYPE_USER_ID,
    date: getTodayDate(),
    metrics: {},
    meals_log: [],
    training_log: [],
    daily_nutrition_summary: {
      total_calories: 0,
      total_proteins_g: 0,
      total_carbs_g: 0,
      total_fats_g: 0,
      water_intake_ml: 0,
    },
  };
}

function sanitizeSummary(rawSummary: DailyLog['daily_nutrition_summary'] | null | undefined): DailyLog['daily_nutrition_summary'] {
  return {
    total_calories: Math.max(0, rawSummary?.total_calories || 0),
    total_proteins_g: Math.max(0, rawSummary?.total_proteins_g || 0),
    total_carbs_g: Math.max(0, rawSummary?.total_carbs_g || 0),
    total_fats_g: Math.max(0, rawSummary?.total_fats_g || 0),
    water_intake_ml: Math.max(0, rawSummary?.water_intake_ml || 0)
  };
}

function isDailyLog(value: unknown): value is DailyLog {
  return !!value && typeof value === 'object' && 'daily_nutrition_summary' in value;
}

function isProfileApiResponse(value: unknown): value is ProfileApiResponse {
  return !!value && typeof value === 'object' && 'targets' in value;
}

async function postLogAction(payload: Record<string, unknown>) {
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const parsed = await readJsonResponse<ApiErrorResponse>(response);

  if (!response.ok) {
    throw new Error(extractApiError(parsed) || `Errore API logs (HTTP ${response.status})`);
  }
}

export default function Diary() {
  const router = useRouter();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChartMounted, setIsChartMounted] = useState(false);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState(DEFAULT_DAILY_CALORIE_GOAL);

  const fetchTodayData = async () => {
    setIsLoading(true);
    try {
      const today = getTodayDate();
      const [res, profileRes] = await Promise.all([
        fetch('/api/logs?userId=' + PROTOTYPE_USER_ID + '&date=' + today),
        fetch('/api/profile?userId=' + PROTOTYPE_USER_ID)
      ]);

      const [data, profileData] = await Promise.all([
        readJsonResponse<DailyLog | ApiErrorResponse>(res),
        readJsonResponse<ProfileApiResponse | ApiErrorResponse>(profileRes)
      ]);

      if (!res.ok || !profileRes.ok) {
        throw new Error(
          extractApiError(data)
          || extractApiError(profileData)
          || 'Errore nel recupero dati diario.'
        );
      }

      const profileCalories = Number(
        isProfileApiResponse(profileData)
          ? profileData.targets?.daily_calories
          : undefined
      );
      if (Number.isFinite(profileCalories) && profileCalories > 0) {
        setDailyCalorieGoal(Math.round(profileCalories));
      } else {
        setDailyCalorieGoal(DEFAULT_DAILY_CALORIE_GOAL);
      }

      if (isDailyLog(data)) {
        setLog(data);
        setWaterGlasses(Math.floor((data.daily_nutrition_summary.water_intake_ml || 0) / 250));
      } else {
        setLog(createEmptyDailyLog());
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const chartTimer = setTimeout(() => {
      setIsChartMounted(true);
    }, 0);

    const dataTimer = setTimeout(() => {
      void fetchTodayData();
    }, 0);

    return () => {
      clearTimeout(chartTimer);
      clearTimeout(dataTimer);
    };
  }, []);

  const openAddDialog = (type: MealType) => {
    router.push(`/diary/search?meal_type=${encodeURIComponent(type)}`);
  };

  const rawSummary = log?.daily_nutrition_summary;
  const summary = sanitizeSummary(rawSummary);
  const calorieProgress = Math.min((summary.total_calories / dailyCalorieGoal) * 100, 100);
  const meals = log?.meals_log || [];
  const todayLabel = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const pieData = [
    { name: 'Carboidrati', value: summary.total_carbs_g * 4, color: '#f59e0b' },
    { name: 'Proteine', value: summary.total_proteins_g * 4, color: '#1f8a5b' },
    { name: 'Grassi', value: summary.total_fats_g * 9, color: '#2563eb' },
  ].filter(d => d.value > 0);

  if (pieData.length === 0) pieData.push({ name: 'Vuoto', value: 1, color: '#e5e7eb' });

  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMacros, setEditMacros] = useState<EditMacros>(DEFAULT_EDIT_MACROS);

  const updateEditMacro = <K extends keyof EditMacros>(field: K, value: EditMacros[K]) => {
    setEditMacros((prev) => ({ ...prev, [field]: value }));
  };

  const startEditing = (m: Meal) => {
    setEditingMeal(m);
    setEditMacros({
      calories: Math.round(m.calories),
      carbs_g: Math.round(m.carbs_g),
      proteins_g: Math.round(m.proteins_g),
      fats_g: Math.round(m.fats_g)
    });
    setIsEditModalOpen(true);
  };

  const confirmEdit = async () => {
    if (!editingMeal) return;
    setIsEditModalOpen(false);
    setIsLoading(true);
    try {
      const updatedMeal = { ...editingMeal, ...editMacros };
      const today = getTodayDate();
      await postLogAction({
        userId: PROTOTYPE_USER_ID,
        date: today,
        action: 'edit_meal',
        meal: updatedMeal,
        old_meal: editingMeal
      });
      await fetchTodayData();
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  const handleDeleteMeal = async (mealToDelete: Meal) => {
    setIsLoading(true);
    try {
      const today = getTodayDate();
      await postLogAction({
        userId: PROTOTYPE_USER_ID,
        date: today,
        action: 'delete_meal',
        meal: mealToDelete
      });
      await fetchTodayData();
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  const handleWaterGlassesChange = async (nextGlasses: number) => {
    const clampedGlasses = Math.max(0, nextGlasses);
    const nextWaterMl = clampedGlasses * 250;

    setWaterGlasses(clampedGlasses);

    try {
      const today = getTodayDate();
      await postLogAction({
        userId: PROTOTYPE_USER_ID,
        date: today,
        action: 'update_water',
        water_ml: nextWaterMl,
      });

      setLog((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          daily_nutrition_summary: {
            ...prev.daily_nutrition_summary,
            water_intake_ml: nextWaterMl,
          },
        };
      });
    } catch (e) {
      console.error(e);
    }
  };

  const renderMealSection = (type: MealType, title: string, helper: string) => {
    const sectionMeals = meals.filter((m) => m.meal_type === type || (!m.meal_type && type === 'colazione'));
    const sectionCals = sectionMeals.reduce((acc, m) => acc + (m.calories || 0), 0);

    return (
      <Card key={type} className="mb-4 border border-border/75 bg-card shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-foreground">{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{Math.round(sectionCals)} kcal</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {sectionMeals.length > 0 ? (
            <ul className="mb-3 space-y-2">
              {sectionMeals.map((m, index) => (
                <li key={m.id || `${m.name}-${m.time}-${index}`} className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-soft/50 px-2.5 py-2 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground" style={{ textTransform: 'capitalize' }}>{m.name}</span>
                    <span className="text-[11px] text-muted-foreground">C: {Math.round(m.carbs_g)}g | P: {Math.round(m.proteins_g)}g | G: {Math.round(m.fats_g)}g</span>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5">
                    <span className="mr-1 whitespace-nowrap text-[12px] font-semibold text-muted-foreground">{Math.round(m.calories)} kcal</span>
                    <Button variant="ghost" size="icon-sm" className="h-8 w-8" aria-label={`Modifica ${m.name}`} onClick={() => startEditing(m)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-8 w-8" aria-label={`Elimina ${m.name}`} onClick={() => handleDeleteMeal(m)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 rounded-lg bg-surface-soft/60 p-2.5 text-xs text-muted-foreground">Nessun alimento inserito.</p>
          )}
          <Button variant="outline" size="default" className="h-10 w-full border-primary/20 text-primary hover:bg-primary/10" onClick={() => openAddDialog(type)}>
            <Plus className="w-4 h-4 mr-2" /> Aggiungi
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (isLoading && !log) {
    return (
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="animate-pulse space-y-4">
          <div className="h-14 w-2/3 rounded-xl bg-muted" />
          <div className="h-36 rounded-2xl bg-muted/80" />
          <div className="h-20 rounded-2xl bg-muted/80" />
          <div className="h-32 rounded-2xl bg-muted/80" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
      <header className="mb-4">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <CalendarDays className="h-3.5 w-3.5" /> {todayLabel}
        </p>
        <h1 className="mt-2 text-3xl font-black text-foreground">Diario Alimentare</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitora calorie, macro e idratazione per guidare il piano quotidiano.</p>
      </header>

      <Card className="overflow-hidden border border-border/75 bg-gradient-to-br from-card via-card to-surface-soft/80 shadow-sm">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="relative flex h-28 min-h-[96px] w-1/3 min-w-[96px] items-center justify-center">
            {isChartMounted && (
              <PieChart width={96} height={96}>
                <Pie data={pieData} dataKey="value" innerRadius={25} outerRadius={40} paddingAngle={2}>
                  {pieData.map((entry, index) => (
                    <Cell key={'cell-' + index} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-bold">{Math.round(summary.total_calories)}</span>
              <span className="text-[8px] text-muted-foreground">kcal</span>
            </div>
          </div>
          <div className="flex w-2/3 flex-col justify-center gap-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold">Calorie Totali</span>
                <span className="text-muted-foreground">{Math.round(summary.total_calories)} / {dailyCalorieGoal} kcal</span>
              </div>
              <Progress aria-label="Progressione calorie giornaliere" value={calorieProgress} className="h-2 rounded-full bg-muted" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div className="flex flex-col"><span className="font-bold text-warning">{summary.total_carbs_g ? Math.round(summary.total_carbs_g) : 0}g</span>Carbo</div>
              <div className="flex flex-col border-x border-border"><span className="font-bold text-success">{summary.total_proteins_g ? Math.round(summary.total_proteins_g) : 0}g</span>Pro</div>
              <div className="flex flex-col"><span className="font-bold text-info">{summary.total_fats_g ? Math.round(summary.total_fats_g) : 0}g</span>Grassi</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border border-primary/20 bg-primary/10 shadow-sm">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/20 p-2">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">Acqua</p>
              <p className="text-xs text-muted-foreground">{waterGlasses * 250} ml tot (bicchieri: {waterGlasses})</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Riduci acqua" className="h-9 w-9 rounded-full border-primary/30" onClick={() => void handleWaterGlassesChange(waterGlasses - 1)}>-</Button>
            <Button variant="default" size="icon" aria-label="Aumenta acqua" className="h-9 w-9 rounded-full" onClick={() => void handleWaterGlassesChange(waterGlasses + 1)}>+</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        {MEAL_SECTIONS.map((section) => renderMealSection(section.type, section.title, section.helper))}
      </div>

      <div className="-mt-1 text-center">
        <a
          href="https://platform.fatsecret.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-primary hover:underline"
        >
          Powered by FatSecret
        </a>
      </div>

      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
        setIsEditModalOpen(open);
        if (!open) setEditingMeal(null);
      }}>
        <DialogContent className="sm:max-w-[425px] w-[95vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>Modifica Alimento</DialogTitle>
          </DialogHeader>
          {editingMeal && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="text-center mb-2">
                <h3 className="font-bold text-lg" style={{ textTransform: 'capitalize' }}>{editingMeal.name}</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Calorie (kcal)</label>
                  <Input type="number" value={editMacros.calories} onChange={(e) => updateEditMacro('calories', Number(e.target.value))} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-warning">Carbo (g)</label>
                    <Input type="number" value={editMacros.carbs_g} onChange={(e) => updateEditMacro('carbs_g', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-success">Pro (g)</label>
                    <Input type="number" value={editMacros.proteins_g} onChange={(e) => updateEditMacro('proteins_g', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-info">Grassi (g)</label>
                    <Input type="number" value={editMacros.fats_g} onChange={(e) => updateEditMacro('fats_g', Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="flex-1">Annulla</Button>
                <Button onClick={confirmEdit} className="flex-1" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salva'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
