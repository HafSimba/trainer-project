'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell } from "recharts";
import { Plus, Droplets, Trash2, Loader2, Pencil } from "lucide-react";
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
  const pieData = [
    { name: 'Carboidrati', value: summary.total_carbs_g * 4, color: '#3b82f6' },
    { name: 'Proteine', value: summary.total_proteins_g * 4, color: '#ef4444' },
    { name: 'Grassi', value: summary.total_fats_g * 9, color: '#f59e0b' },
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

  const renderMealSection = (type: MealType, title: string) => {
    const sectionMeals = meals.filter((m) => m.meal_type === type || (!m.meal_type && type === 'colazione'));
    const sectionCals = sectionMeals.reduce((acc, m) => acc + (m.calories || 0), 0);

    return (
      <Card className="mb-4 shadow-sm border-none">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-gray-800">{title}</CardTitle>
          <span className="text-sm font-semibold text-gray-500">{Math.round(sectionCals)} kcal</span>
        </CardHeader>
        <CardContent>
          {sectionMeals.length > 0 ? (
            <ul className="space-y-2 mb-3">
              {sectionMeals.map((m) => (
                <li key={m.id} className="flex justify-between items-center text-sm border-b pb-1 last:border-0">
                  <div className="flex flex-col">
                    <span className="font-medium" style={{ textTransform: 'capitalize' }}>{m.name}</span>
                    <span className="text-[10px] text-gray-400">C: {Math.round(m.carbs_g)}g | P: {Math.round(m.proteins_g)}g | G: {Math.round(m.fats_g)}g</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 mr-2">{Math.round(m.calories)} kcal</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditing(m)}>
                      <Pencil className="w-3 h-3 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteMeal(m)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Nessun alimento inserito.</p>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => openAddDialog(type)}>
            <Plus className="w-4 h-4 mr-2" /> Aggiungi
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="flex-1 p-4 flex flex-col gap-4 pt-8 pb-24 overflow-y-auto">
      <h1 className="text-2xl font-bold text-gray-900">Diario Alimentare</h1>

      <Card className="shadow-sm border-none bg-white">
        <CardContent className="p-4 flex gap-4 items-center">
          <div className="w-1/3 relative h-28 min-w-[96px] min-h-[96px] flex items-center justify-center">
            {isChartMounted && (
              <PieChart width={96} height={96}>
                <Pie data={pieData} dataKey="value" innerRadius={25} outerRadius={40} paddingAngle={2}>
                  {pieData.map((entry, index) => (
                    <Cell key={'cell-' + index} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            )}
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-xs font-bold">{Math.round(summary.total_calories)}</span>
              <span className="text-[8px] text-gray-400">kcal</span>
            </div>
          </div>
          <div className="w-2/3 flex flex-col gap-2 justify-center">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">Calorie Totali</span>
                <span className="text-gray-500">{Math.round(summary.total_calories)} / {dailyCalorieGoal} kcal</span>
              </div>
              <Progress value={calorieProgress} className="h-2" />
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] text-center mt-2">
              <div className="flex flex-col"><span className="text-blue-500 font-bold">{summary.total_carbs_g ? Math.round(summary.total_carbs_g) : 0}g</span>Carbo</div>
              <div className="flex flex-col border-l border-r"><span className="text-red-500 font-bold">{summary.total_proteins_g ? Math.round(summary.total_proteins_g) : 0}g</span>Pro</div>
              <div className="flex flex-col"><span className="text-amber-500 font-bold">{summary.total_fats_g ? Math.round(summary.total_fats_g) : 0}g</span>Grassi</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-none bg-blue-50/50">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <Droplets className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-bold text-gray-800">Acqua</p>
              <p className="text-xs text-gray-500">{waterGlasses * 250} ml tot (bicchieri: {waterGlasses})</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-blue-200" onClick={() => void handleWaterGlassesChange(waterGlasses - 1)}>-</Button>
            <Button variant="default" size="icon" className="h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-600" onClick={() => void handleWaterGlassesChange(waterGlasses + 1)}>+</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-2">
        {renderMealSection('colazione', 'Colazione')}
        {renderMealSection('pranzo', 'Pranzo')}
        {renderMealSection('cena', 'Cena')}
        {renderMealSection('snack', 'Snacks')}
      </div>

      <div className="-mt-1 text-center">
        <a
          href="https://platform.fatsecret.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-green-600 hover:underline"
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
                    <label className="text-xs font-semibold mb-1 block text-blue-500">Carbo (g)</label>
                    <Input type="number" value={editMacros.carbs_g} onChange={(e) => updateEditMacro('carbs_g', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-red-500">Pro (g)</label>
                    <Input type="number" value={editMacros.proteins_g} onChange={(e) => updateEditMacro('proteins_g', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block text-amber-500">Grassi (g)</label>
                    <Input type="number" value={editMacros.fats_g} onChange={(e) => updateEditMacro('fats_g', Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="flex-1">Annulla</Button>
                <Button onClick={confirmEdit} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
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
