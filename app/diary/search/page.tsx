'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { MealType } from '@/lib/types/database';

const PROTOTYPE_USER_ID = 'tester-user-123';
const METRIC_UNIT_KEY = 'metric_100';

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

type FatSecretNutriments = {
  'energy-kcal_100g'?: number;
  'energy-kcal'?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
};

type FatSecretServingOption = {
  serving_id: string;
  label: string;
  number_of_units: number;
  measurement_description?: string;
  metric_serving_amount?: number;
  metric_serving_unit?: string;
  is_default: boolean;
  nutriments: {
    calories: number;
    proteins_g: number;
    carbohydrates_g: number;
    fats_g: number;
  };
};

type FatSecretFoodProduct = {
  food_id?: string;
  product_name?: string;
  brands?: string;
  nutriments?: FatSecretNutriments;
  serving_options?: FatSecretServingOption[];
};

type SearchApiResponse = {
  products?: FatSecretFoodProduct[];
  warning?: string;
  error?: string;
};

type SelectedFoodItem = {
  id: string;
  product: FatSecretFoodProduct;
  quantity: number;
  unitKey: string;
};

type ComputedMacros = {
  calories: number;
  proteins_g: number;
  carbs_g: number;
  fats_g: number;
};

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function parseJsonSafe<T>(text: string): T | null {
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(first: string, second: string): number {
  if (first === second) return 0;
  if (!first.length) return second.length;
  if (!second.length) return first.length;

  const matrix = Array.from({ length: first.length + 1 }, () => new Array(second.length + 1).fill(0));

  for (let row = 0; row <= first.length; row += 1) matrix[row][0] = row;
  for (let col = 0; col <= second.length; col += 1) matrix[0][col] = col;

  for (let row = 1; row <= first.length; row += 1) {
    for (let col = 1; col <= second.length; col += 1) {
      const cost = first[row - 1] === second[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[first.length][second.length];
}

function scoreProduct(name: string, query: string): number {
  const normalizedName = normalizeText(name);
  const normalizedQuery = normalizeText(query);

  if (!normalizedName || !normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 1200;

  let score = 0;

  if (normalizedName.startsWith(normalizedQuery)) score += 700;
  if (normalizedName.includes(normalizedQuery)) score += 500;

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  queryWords.forEach((word) => {
    if (word.length >= 2 && normalizedName.includes(word)) {
      score += 90;
    }
  });

  const distance = levenshteinDistance(normalizedName, normalizedQuery);
  score += Math.max(0, 300 - distance * 25);

  return score;
}

function isMealType(value: string | null): value is MealType {
  return value === 'colazione' || value === 'pranzo' || value === 'cena' || value === 'snack';
}

function buildSearchCandidates(query: string): string[] {
  const clean = query.trim();
  if (!clean) return [];

  const candidates = [clean];

  if (clean.length >= 5) {
    candidates.push(clean.slice(0, -1));
  }

  const words = normalizeText(clean).split(' ').filter((word) => word.length >= 3);
  if (words.length > 1) {
    candidates.push(words[0]);
    candidates.push(words[words.length - 1]);
    candidates.push(words.slice(0, 2).join(' '));
  }

  return Array.from(new Set(candidates.map((item) => item.trim()).filter(Boolean)));
}

function getProductCaloriesPer100g(product: FatSecretFoodProduct | null): number {
  if (!product) return 0;

  return (
    product.nutriments?.['energy-kcal_100g']
    || product.nutriments?.['energy-kcal']
    || (product.nutriments?.energy_100g ? product.nutriments.energy_100g / 4.184 : 0)
    || 0
  );
}

function getMetricMacrosPer100g(product: FatSecretFoodProduct): ComputedMacros {
  return {
    calories: getProductCaloriesPer100g(product),
    proteins_g: product.nutriments?.proteins_100g || 0,
    carbs_g: product.nutriments?.carbohydrates_100g || 0,
    fats_g: product.nutriments?.fat_100g || 0,
  };
}

function getUnitOptions(product: FatSecretFoodProduct): Array<{ key: string; label: string }> {
  const options = [{ key: METRIC_UNIT_KEY, label: 'Grammi / ml' }];

  const servingOptions = product.serving_options || [];
  servingOptions.forEach((serving) => {
    options.push({
      key: `serving:${serving.serving_id}`,
      label: serving.label,
    });
  });

  return options;
}

function getSelectedServing(item: SelectedFoodItem): FatSecretServingOption | null {
  if (!item.unitKey.startsWith('serving:')) {
    return null;
  }

  const servingId = item.unitKey.replace('serving:', '');
  return item.product.serving_options?.find((serving) => serving.serving_id === servingId) || null;
}

function computeItemMacros(item: SelectedFoodItem): ComputedMacros {
  const safeQuantity = Math.max(0, Number(item.quantity) || 0);
  const selectedServing = getSelectedServing(item);

  if (selectedServing) {
    return {
      calories: Number((selectedServing.nutriments.calories * safeQuantity).toFixed(2)),
      proteins_g: Number((selectedServing.nutriments.proteins_g * safeQuantity).toFixed(2)),
      carbs_g: Number((selectedServing.nutriments.carbohydrates_g * safeQuantity).toFixed(2)),
      fats_g: Number((selectedServing.nutriments.fats_g * safeQuantity).toFixed(2)),
    };
  }

  const metric = getMetricMacrosPer100g(item.product);
  const ratio = safeQuantity / 100;

  return {
    calories: Number((metric.calories * ratio).toFixed(2)),
    proteins_g: Number((metric.proteins_g * ratio).toFixed(2)),
    carbs_g: Number((metric.carbs_g * ratio).toFixed(2)),
    fats_g: Number((metric.fats_g * ratio).toFixed(2)),
  };
}

export default function DiaryFoodSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawMealType = searchParams.get('meal_type');
  const mealType: MealType = isMealType(rawMealType) ? rawMealType : 'colazione';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FatSecretFoodProduct[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<SelectedFoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const addSelectedProduct = useCallback((product: FatSecretFoodProduct) => {
    const defaultServing = product.serving_options?.find((serving) => serving.is_default) || product.serving_options?.[0] || null;

    setSelectedFoods((previous) => [
      ...previous,
      {
        id: uuidv4(),
        product,
        quantity: defaultServing ? 1 : 100,
        unitKey: defaultServing ? `serving:${defaultServing.serving_id}` : METRIC_UNIT_KEY,
      },
    ]);
  }, []);

  const searchFoods = useCallback(async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    setIsSearching(true);
    setWarning(null);
    setError(null);

    try {
      const candidates = buildSearchCandidates(trimmedQuery);
      const uniqueProducts = new Map<string, FatSecretFoodProduct>();
      const warnings: string[] = [];

      for (const candidate of candidates) {
        const response = await fetch(`/api/fatsecret/search?q=${encodeURIComponent(candidate)}&limit=20`);
        const rawText = await response.text();
        const data = parseJsonSafe<SearchApiResponse>(rawText);

        if (!response.ok) {
          throw new Error(data?.error || `Errore ricerca alimenti (HTTP ${response.status})`);
        }

        if (data?.warning) {
          warnings.push(data.warning);
        }

        (data?.products || []).forEach((product) => {
          const key = `${product.food_id || ''}::${normalizeText(product.product_name || '')}`;
          if (!uniqueProducts.has(key)) {
            uniqueProducts.set(key, product);
          }
        });

        if (uniqueProducts.size >= 24) {
          break;
        }
      }

      const ranked = Array.from(uniqueProducts.values())
        .sort((a, b) => {
          const aScore = scoreProduct(a.product_name || '', trimmedQuery);
          const bScore = scoreProduct(b.product_name || '', trimmedQuery);
          return bScore - aScore;
        })
        .slice(0, 20);

      setSearchResults(ranked);

      if (warnings.length > 0 && ranked.length === 0) {
        setWarning(warnings[0]);
      }

      if (ranked.length === 0 && warnings.length === 0) {
        setWarning('Nessun risultato trovato. Prova con un nome più corto o usa lo scanner barcode.');
      }
    } catch (searchError) {
      const message = searchError instanceof Error ? searchError.message : 'Errore durante la ricerca alimenti.';
      setError(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const selectedTotals = useMemo(() => {
    return selectedFoods.reduce(
      (acc, item) => {
        const macros = computeItemMacros(item);

        acc.calories += macros.calories;
        acc.proteins_g += macros.proteins_g;
        acc.carbs_g += macros.carbs_g;
        acc.fats_g += macros.fats_g;

        return acc;
      },
      { calories: 0, proteins_g: 0, carbs_g: 0, fats_g: 0 }
    );
  }, [selectedFoods]);

  const saveSelectedFoods = useCallback(async () => {
    if (selectedFoods.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      const now = new Date();
      const mealTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

      const meals = selectedFoods.map((item) => {
        const macros = computeItemMacros(item);

        return {
          id: uuidv4(),
          time: mealTime,
          meal_type: mealType,
          name: item.product.product_name || 'Alimento',
          calories: macros.calories,
          proteins_g: macros.proteins_g,
          carbs_g: macros.carbs_g,
          fats_g: macros.fats_g,
        };
      });

      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: PROTOTYPE_USER_ID,
          date: getTodayDate(),
          action: 'add_meals',
          meals,
        }),
      });

      const rawText = await response.text();
      const data = parseJsonSafe<{ error?: string }>(rawText);

      if (!response.ok) {
        throw new Error(data?.error || `Errore salvataggio pasti (HTTP ${response.status})`);
      }

      router.push('/diary');
      router.refresh();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Errore durante il salvataggio.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [mealType, router, selectedFoods]);

  return (
    <main className="flex-1 p-4 pt-8 pb-24 overflow-y-auto flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push('/diary')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ricerca alimento</h1>
          <p className="text-xs text-gray-500">Aggiunta a: {MEAL_TYPE_LABEL[mealType]}</p>
        </div>
      </div>

      <Card className="shadow-sm border-none">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Cerca alimento..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void searchFoods();
                }
              }}
            />
            <Button size="icon" onClick={() => void searchFoods()} disabled={isSearching}>
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant={showScanner ? 'default' : 'secondary'} onClick={() => setShowScanner((prev) => !prev)}>
              <Camera className="w-4 h-4" />
            </Button>
          </div>

          {showScanner && (
            <div className="bg-black rounded-lg overflow-hidden">
              <BarcodeScanner onProductFound={addSelectedProduct} />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {!error && warning && <p className="text-sm text-amber-600">{warning}</p>}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-none bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Selezionati ({selectedFoods.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {selectedFoods.length === 0 ? (
            <p className="text-xs text-gray-500">Nessun alimento selezionato.</p>
          ) : (
            <>
              <div className="space-y-2">
                {selectedFoods.map((item) => {
                  const unitOptions = getUnitOptions(item.product);
                  const selectedServing = getSelectedServing(item);
                  const computedMacros = computeItemMacros(item);

                  return (
                    <Card key={item.id} className="border border-blue-100 shadow-none">
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm leading-tight">{item.product.product_name || 'Alimento'}</p>
                            {item.product.brands && <p className="text-xs text-gray-500">{item.product.brands}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedFoods((previous) => previous.filter((food) => food.id !== item.id))}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Unità</label>
                            <select
                              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                              value={item.unitKey}
                              onChange={(event) => {
                                const nextUnitKey = event.target.value;
                                setSelectedFoods((previous) => previous.map((food) => {
                                  if (food.id !== item.id) return food;

                                  return {
                                    ...food,
                                    unitKey: nextUnitKey,
                                    quantity: nextUnitKey === METRIC_UNIT_KEY ? 100 : 1,
                                  };
                                }));
                              }}
                            >
                              {unitOptions.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">
                              {selectedServing ? 'Quantità (porzioni)' : 'Quantità (g/ml)'}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step={selectedServing ? '0.25' : '1'}
                              value={item.quantity}
                              onChange={(event) => {
                                const nextQuantity = Number(event.target.value);
                                setSelectedFoods((previous) => previous.map((food) => {
                                  if (food.id !== item.id) return food;
                                  return { ...food, quantity: Number.isFinite(nextQuantity) ? nextQuantity : 0 };
                                }));
                              }}
                            />
                          </div>
                        </div>

                        <p className="text-[11px] text-gray-500">
                          {Math.round(computedMacros.calories)} kcal • C {Math.round(computedMacros.carbs_g)}g • P {Math.round(computedMacros.proteins_g)}g • G {Math.round(computedMacros.fats_g)}g
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="bg-white rounded-lg border border-blue-100 p-3 text-xs text-gray-600">
                Totale selezionati: {Math.round(selectedTotals.calories)} kcal • C {Math.round(selectedTotals.carbs_g)}g • P {Math.round(selectedTotals.proteins_g)}g • G {Math.round(selectedTotals.fats_g)}g
              </div>

              <Button onClick={() => void saveSelectedFoods()} disabled={isSaving || selectedFoods.length === 0}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salva nel diario
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Risultati ricerca</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {searchResults.length === 0 ? (
            <p className="text-xs text-gray-500">Esegui una ricerca o usa lo scanner per aggiungere alimenti.</p>
          ) : (
            searchResults.map((item, index) => (
              <Card key={`${item.food_id || item.product_name || 'food'}-${index}`} className="border border-gray-100 shadow-none">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{item.product_name}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{item.brands || 'Marca non disponibile'}</p>
                    <p className="text-[11px] text-gray-400">{Math.round(getProductCaloriesPer100g(item))} kcal / 100g</p>
                  </div>

                  <Button size="icon" onClick={() => addSelectedProduct(item)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
