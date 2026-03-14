'use client';

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Plus, Search, Camera, Droplets, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { v4 as uuidv4 } from "uuid";

const PROTOTYPE_USER_ID = "tester-user-123";
const DAILY_CALORIE_GOAL = 2400; // Mock goal

type MealType = 'colazione' | 'pranzo' | 'cena' | 'snack';

export default function Diary() {
  const [log, setLog] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [waterGlasses, setWaterGlasses] = useState(0);

  // Add Item Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('colazione');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Selected item payload state for quantity editing
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [servingQty, setServingQty] = useState<number>(100);

  const fetchTodayData = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(\/api/logs?userId=\&date=\\);
      const data = await res.json();
      if (data && data.daily_nutrition_summary) {
        setLog(data);
        setWaterGlasses(Math.floor((data.daily_nutrition_summary.water_intake_ml || 0) / 250));
      } else {
        setLog({ meals_log: [], daily_nutrition_summary: { total_calories: 0, total_proteins_g: 0, total_carbs_g: 0, total_fats_g: 0, water_intake_ml: 0 } });
      }
    } catch (e) {
      console.error("Error", e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTodayData();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setShowScanner(false);
    try {
      const res = await fetch(\https://world.openfoodfacts.org/cgi/search.pl?search_terms=\&search_simple=1&action=process&json=1&page_size=10\);
      const data = await res.json();
      setSearchResults(data.products || []);
    } catch (e) {
      console.error(e);
    }
    setIsSearching(false);
  };

  const openAddDialog = (type: MealType) => {
    setSelectedMealType(type);
    setSelectedProduct(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowScanner(false);
    setServingQty(100);
    setIsAddDialogOpen(true);
  };

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
  };

  const confirmAddingProduct = async () => {
    if (!selectedProduct) return;
    const ratio = servingQty / 100;
    
    const meal = {
      id: uuidv4(),
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      meal_type: selectedMealType,
      name: selectedProduct.product_name || 'Prodotto Variato',
      calories: ((selectedProduct.nutriments?.energy_kcal_100g || 0) * ratio),
      proteins_g: ((selectedProduct.nutriments?.proteins_100g || 0) * ratio),
      carbs_g: ((selectedProduct.nutriments?.carbohydrates_100g || 0) * ratio),
      fats_g: ((selectedProduct.nutriments?.fat_100g || 0) * ratio)
    };

    setIsAddDialogOpen(false);
    
    // Save to DB
    try {
      const today = new Date().toISOString().split('T')[0];
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: PROTOTYPE_USER_ID, date: today, meal })
      });
      fetchTodayData();
    } catch (e) {
      console.error(e);
    }
  };

  // Aggregation
  const summary = log?.daily_nutrition_summary || { total_calories: 0, total_proteins_g: 0, total_carbs_g: 0, total_fats_g: 0 };
  const meals = log?.meals_log || [];

  const pieData = [
    { name: 'Carboidrati', value: summary.total_carbs_g * 4, color: '#3b82f6' },
    { name: 'Proteine', value: summary.total_proteins_g * 4, color: '#ef4444' },
    { name: 'Grassi', value: summary.total_fats_g * 9, color: '#f59e0b' },
  ].filter(d => d.value > 0);
  
  if (pieData.length === 0) pieData.push({ name: 'Vuoto', value: 1, color: '#e5e7eb' });

  const renderMealSection = (type: MealType, title: string) => {
    const sectionMeals = meals.filter((m: any) => m.meal_type === type || (!m.meal_type && type === 'colazione'));
    const sectionCals = sectionMeals.reduce((acc: number, m: any) => acc + (m.calories || 0), 0);

    return (
      <Card className="mb-4 shadow-sm border-none">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-gray-800">{title}</CardTitle>
          <span className="text-sm font-semibold text-gray-500">{Math.round(sectionCals)} kcal</span>
        </CardHeader>
        <CardContent>
          {sectionMeals.length > 0 ? (
            <ul className="space-y-2 mb-3">
              {sectionMeals.map((m: any) => (
                <li key={m.id} className="flex justify-between items-center text-sm border-b pb-1 last:border-0">
                  <div className="flex flex-col">
                    <span className="font-medium" style={{textTransform: 'capitalize'}}>{m.name}</span>
                    <span className="text-[10px] text-gray-400">C: {Math.round(m.carbs_g)}g | P: {Math.round(m.proteins_g)}g | G: {Math.round(m.fats_g)}g</span>
                  </div>
                  <span className="text-gray-600">{Math.round(m.calories)} kcal</span>
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
      
      {/* Top Chart Section */}
      <Card className="shadow-sm border-none bg-white">
         <CardContent className="p-4 flex gap-4 items-center">
            <div className="w-1/3 relative h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={25} outerRadius={40} paddingAngle={2}>
                      {pieData.map((entry, index) => (
                        <Cell key={\cell-\\} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-xs font-bold">{Math.round(summary.total_calories)}</span>
                    <span className="text-[8px] text-gray-400">kcal</span>
                </div>
            </div>
            <div className="w-2/3 flex flex-col gap-2 justify-center">
                <div>
                   <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold">Calorie Totali</span>
                      <span className="text-gray-500">{Math.round(summary.total_calories)} / {DAILY_CALORIE_GOAL} kcal</span>
                   </div>
                   <Progress value={(summary.total_calories / DAILY_CALORIE_GOAL) * 100} className="h-2" />
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] text-center mt-2">
                    <div className="flex flex-col"><span className="text-blue-500 font-bold">{summary.total_carbs_g ? Math.round(summary.total_carbs_g): 0}g</span>Carbo</div>
                    <div className="flex flex-col border-l border-r"><span className="text-red-500 font-bold">{summary.total_proteins_g ? Math.round(summary.total_proteins_g) : 0}g</span>Pro</div>
                    <div className="flex flex-col"><span className="text-amber-500 font-bold">{summary.total_fats_g ? Math.round(summary.total_fats_g) : 0}g</span>Grassi</div>
                </div>
            </div>
         </CardContent>
      </Card>

      {/* Water Counter */}
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
               <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-blue-200" onClick={() => setWaterGlasses(Math.max(0, waterGlasses - 1))}>-</Button>
               <Button variant="default" size="icon" className="h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-600" onClick={() => setWaterGlasses(waterGlasses + 1)}>+</Button>
            </div>
         </CardContent>
      </Card>

      {/* Meal Sections */}
      <div className="mt-2">
        {renderMealSection('colazione', 'Colazione')}
        {renderMealSection('pranzo', 'Pranzo')}
        {renderMealSection('cena', 'Cena')}
        {renderMealSection('snack', 'Snacks')}
      </div>

      {/* Adding Food Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{textTransform:'capitalize'}}>Aggiungi a {selectedMealType}</DialogTitle>
          </DialogHeader>
          
          {!selectedProduct ? (
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex gap-2">
                <Input 
                  placeholder="Cerca alimento (es: Mela)" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching} size="icon">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
                <Button onClick={() => setShowScanner(!showScanner)} variant="secondary" size="icon">
                  <Camera className="w-4 h-4" />
                </Button>
              </div>

              {showScanner && (
                 <div className="bg-black rounded-lg overflow-hidden">
                   <BarcodeScanner onProductFound={(p) => handleProductSelect(p)} />
                 </div>
              )}

              <div className="space-y-2">
                {searchResults.map((item, idx) => (
                  <Card key={idx} className="cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors" onClick={() => handleProductSelect(item)}>
                    <CardContent className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.brands}</p>
                      </div>
                      <span className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded">
                        {Math.round(item.nutriments?.energy_kcal_100g || 0)} kcal/100g
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <div className="text-center mb-2">
                 <h3 className="font-bold text-lg">{selectedProduct.product_name}</h3>
                 <p className="text-sm text-gray-500 mb-4">{Math.round(selectedProduct.nutriments?.energy_kcal_100g || 0)} kcal per 100g</p>
                 
                 <label className="text-sm font-semibold mb-2 block">Quantità mangiata (in grammi o ml)</label>
                 <Input type="number" value={servingQty} onChange={(e) => setServingQty(Number(e.target.value))} className="text-center text-xl" />
              </div>
              
              <div className="bg-gray-50 p-4 rounded-xl flex justify-between text-sm shadow-inner">
                 <div className="flex flex-col items-center"><span className="font-bold text-blue-500">{Math.round(((selectedProduct.nutriments?.carbohydrates_100g || 0) * servingQty/100))}g</span>Carbo</div>
                 <div className="flex flex-col items-center"><span className="font-bold text-red-500">{Math.round(((selectedProduct.nutriments?.proteins_100g || 0) * servingQty/100))}g</span>Pro</div>
                 <div className="flex flex-col items-center"><span className="font-bold text-amber-500">{Math.round(((selectedProduct.nutriments?.fat_100g || 0) * servingQty/100))}g</span>Grassi</div>
                 <div className="flex flex-col items-center"><span className="font-bold text-black">{Math.round(((selectedProduct.nutriments?.energy_kcal_100g || 0) * servingQty/100))}</span>kcal</div>
              </div>

              <div className="flex gap-2 mt-4">
                 <Button variant="outline" onClick={() => setSelectedProduct(null)} className="flex-1">Indietro</Button>
                 <Button onClick={confirmAddingProduct} className="flex-1 bg-green-600 hover:bg-green-700">Conferma {selectedMealType}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
