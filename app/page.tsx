'use client';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Activity, Apple, Zap, Camera, Plus, Loader2 } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { v4 as uuidv4 } from 'uuid';

// Hardcoded userId for prototype
const PROTOTYPE_USER_ID = "tester-user-123";

export default function Dashboard() {
  const [showScanner, setShowScanner] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State for daily summary
  const [dailySummary, setDailySummary] = useState({
    calories: 0,
    proteins: 0,
    carbs: 0,
    fats: 0
  });

  // Carica i dati di oggi all'avvio
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

  const handleProductFound = (product: any) => {
    setLastScannedProduct(product);
    setShowScanner(false);
  };

  const saveMealToDatabase = async () => {
    if (!lastScannedProduct) return;
    setIsSaving(true);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      
      const meal = {
        id: uuidv4(),
        time,
        name: lastScannedProduct.product_name,
        calories: lastScannedProduct.nutriments?.energy_kcal_100g || 0,
        proteins_g: lastScannedProduct.nutriments?.proteins_100g || 0,
        carbs_g: lastScannedProduct.nutriments?.carbohydrates_100g || 0,
        fats_g: lastScannedProduct.nutriments?.fat_100g || 0
      };

      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: PROTOTYPE_USER_ID, date: today, meal })
      });

      if (!res.ok) throw new Error('Failed to save meal');
      
      // Clear scanner result and refresh stats
      setLastScannedProduct(null);
      await fetchTodayData();
      
    } catch (error) {
      console.error("Error saving meal:", error);
      alert("Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex-1 p-6 flex flex-col gap-6 pt-10 pb-24">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Ciao! 👋</h1>
        <p className="text-gray-500 mt-1">Ecco il riepilogo di oggi.</p>
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
            <p className="text-sm text-gray-500 mt-1">Sulla base del tuo riposo</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="shadow-sm border-none bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                <Apple className="h-4 w-4" /> Nutrizione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{Math.round(dailySummary.calories)}</p>
              <p className="text-xs text-gray-500 mt-1">kcal assunte oggi</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-none bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                <Activity className="h-4 w-4" /> Attività
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">45 min</p>
              <p className="text-xs text-gray-500 mt-1">Allenamento</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold">I tuoi Pasti</h2>
          <Button variant="outline" size="sm" onClick={() => setShowScanner(!showScanner)}>
            <Camera className="w-4 h-4 mr-2" /> Scannerizza
          </Button>
        </div>
        
        {showScanner && (
          <div className="mb-4">
            <BarcodeScanner onProductFound={handleProductFound} />
          </div>
        )}

        {lastScannedProduct && (
          <Card className="shadow-sm bg-white mb-4 border-green-200">
            <CardContent className="p-4">
              <p className="font-bold text-green-700">Prodotto Trovato!</p>
              <p className="text-sm font-semibold">{lastScannedProduct.product_name || 'Prodotto Sconosciuto'}</p>
              <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
                <span className="bg-gray-100 px-2 py-1 rounded">🔥 {lastScannedProduct.nutriments?.energy_kcal_100g || 0} kcal</span>
                <span className="bg-gray-100 px-2 py-1 rounded">🥩 {lastScannedProduct.nutriments?.proteins_100g || 0}g pro</span>
                <span className="bg-gray-100 px-2 py-1 rounded">🍞 {lastScannedProduct.nutriments?.carbohydrates_100g || 0}g carbo</span>
              </div>
            </CardContent>
            <CardFooter className="p-4 pt-0">
               <Button className="w-full" onClick={saveMealToDatabase} disabled={isSaving}>
                 {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                 Aggiungi al Diario
               </Button>
            </CardFooter>
          </Card>
        )}

        <Card className="shadow-sm bg-white">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 flex flex-col gap-1">
              <p className="font-semibold mb-1">Riepilogo Macro Attuale:</p>
              <p>Proteine: {Math.round(dailySummary.proteins)}g</p>
              <p>Carboidrati: {Math.round(dailySummary.carbs)}g</p>
              <p>Grassi: {Math.round(dailySummary.fats)}g</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
