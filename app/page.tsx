'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Apple, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PROTOTYPE_USER_ID = "tester-user-123";

export default function Dashboard() {
  const [dailySummary, setDailySummary] = useState({
    calories: 0,
    proteins: 0,
    carbs: 0,
    fats: 0
  });

  useEffect(() => {
    fetchTodayData();
  }, []);

  const fetchTodayData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/logs?userId=' + PROTOTYPE_USER_ID + '&date=' + today);
      const data = await res.json();

      if (data && data.daily_nutrition_summary) {
        setDailySummary({
          calories: data.daily_nutrition_summary.total_calories || 0,
          proteins: data.daily_nutrition_summary.total_proteins_g || 0,
          carbs: data.daily_nutrition_summary.total_carbs_g || 0,
          fats: data.daily_nutrition_summary.total_fats_g || 0
        });
      }
    } catch (error) {
      console.error("Error fetching daily stats:", error);
    }
  };

  return (
    <main className="flex-1 p-6 flex flex-col gap-6 pt-10 pb-24 overflow-y-auto">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Ciao! 👋</h1>
        <p className="text-gray-500 mt-1">Benvenuto in TrAIner. Ecco il tuo bilancio oggi.</p>
      </header>

      <div className="grid gap-4">
        <Card className="shadow-sm border-none bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700">
              <Zap className="h-5 w-5" /> Energia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Ottima</p>
            <p className="text-sm text-gray-500 mt-1">Pronto per spaccare i pesi!</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Link href="/diary" className="block">
            <Card className="shadow-sm border-none bg-green-50/50 hover:bg-green-100 transition-colors h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                  <Apple className="h-4 w-4" /> Nutrizione
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{Math.round(dailySummary.calories)}</p>
                <p className="text-xs text-gray-500 mt-1">kcal oggi / 2400</p>
                <Progress value={(dailySummary.calories / 2400) * 100} className="h-1.5 mt-2 bg-green-200" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/profile" className="block">
             <Card className="shadow-sm border-none bg-orange-50/50 hover:bg-orange-100 transition-colors h-full">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                   <Activity className="h-4 w-4" /> Attività
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <p className="text-xl font-bold">Gambe</p>
                 <p className="text-xs text-gray-500 mt-1">da fare oggi</p>
               </CardContent>
             </Card>
          </Link>
        </div>
      </div>

      <section className="mt-4 flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
         <p className="text-sm text-gray-500 text-center mb-4">Manca ancora esplorazione? Naviga nel Diario tramite il menu per scansionare quello che hai mangiato.</p>
         <Link href="/diary">
            <Button variant="outline" className="rounded-full px-6">Vai al Diario Alimentare</Button>
         </Link>
      </section>
    </main>
  );
}
