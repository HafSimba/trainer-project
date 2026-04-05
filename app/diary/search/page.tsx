'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PROTOTYPE_USER_ID, USER_ID_COOKIE_NAME, USER_ID_STORAGE_KEY, resolveUserId } from '@/lib/config/user';
import { getTodayDate, levenshteinDistance, normalizeText, parseJsonSafe } from '@/lib/utils';
import type { MealType } from '@/lib/types/database';

const METRIC_UNIT_KEY = 'metric_100';

const BarcodeScanner = dynamic(
    () => import('@/components/BarcodeScanner').then((module) => module.BarcodeScanner),
    {
        ssr: false,
        loading: () => (
            <div className="rounded-xl border border-border/70 bg-card px-3 py-4 text-sm text-muted-foreground">
                Caricamento scanner...
            </div>
        ),
    }
);

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

function createClientId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readCookieValue(name: string): string | null {
    if (typeof document === 'undefined') return null;

    const normalizedCookie = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${name}=`));

    if (!normalizedCookie) return null;

    const [, value] = normalizedCookie.split('=', 2);
    if (!value) return null;

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function resolveClientUserId(): string {
    if (typeof window === 'undefined') return PROTOTYPE_USER_ID;

    const userIdFromStorage = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    const userIdFromCookie = readCookieValue(USER_ID_COOKIE_NAME);

    return resolveUserId(userIdFromStorage, userIdFromCookie, PROTOTYPE_USER_ID);
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

function DiaryFoodSearchContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const rawMealType = searchParams.get('meal_type');
    const mealType: MealType = isMealType(rawMealType) ? rawMealType : 'colazione';
    const [activeUserId, setActiveUserId] = useState(PROTOTYPE_USER_ID);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FatSecretFoodProduct[]>([]);
    const [selectedFoods, setSelectedFoods] = useState<SelectedFoodItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    useEffect(() => {
        setActiveUserId(resolveClientUserId());
    }, []);

    const addSelectedProduct = useCallback((product: FatSecretFoodProduct) => {
        const defaultServing = product.serving_options?.find((serving) => serving.is_default) || product.serving_options?.[0] || null;

        setSelectedFoods((previous) => [
            ...previous,
            {
                id: createClientId(),
                product,
                quantity: defaultServing ? 1 : 100,
                unitKey: defaultServing ? `serving:${defaultServing.serving_id}` : METRIC_UNIT_KEY,
            },
        ]);
    }, []);

    const handleScannerProductFound = useCallback((product: FatSecretFoodProduct) => {
        addSelectedProduct(product);
        setShowScanner(false);
    }, [addSelectedProduct]);

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
            }

            const ranked = Array.from(uniqueProducts.values())
                .sort((a, b) => {
                    const aScore = scoreProduct(a.product_name || '', trimmedQuery);
                    const bScore = scoreProduct(b.product_name || '', trimmedQuery);
                    return bScore - aScore;
                });

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
                    id: createClientId(),
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
                    userId: activeUserId,
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
    }, [activeUserId, mealType, router, selectedFoods]);

    return (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-28">
            <div className="space-y-4">
                <section className="motion-enter rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-700 px-4 py-5 text-primary-foreground shadow-[0_12px_28px_-18px_rgba(27,100,67,0.65)]">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" aria-label="Torna al diario" className="border-white/35 bg-white/10 text-white hover:bg-white/20" onClick={() => router.push('/diary')}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold">Ricerca alimento</h1>
                            <p className="text-xs text-primary-foreground/85">Aggiunta a: {MEAL_TYPE_LABEL[mealType]}</p>
                        </div>
                    </div>

                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/90">
                        <Sparkles className="h-3.5 w-3.5" /> Ricerca intelligente + barcode
                    </p>
                </section>

                <Card className="motion-enter motion-delay-1 shrink-0 border border-border/75 bg-card shadow-sm">
                    <CardContent className="flex flex-col gap-3 p-4">
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
                            <Button size="icon" aria-label="Cerca alimento" onClick={() => void searchFoods()} disabled={isSearching}>
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            </Button>
                            <Button size="icon" aria-label="Apri scanner barcode" variant={showScanner ? 'default' : 'secondary'} onClick={() => setShowScanner(true)}>
                                <Camera className="h-4 w-4" />
                            </Button>
                        </div>

                        {error && <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
                        {!error && warning && <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning" role="status">{warning}</p>}
                    </CardContent>
                </Card>

                <Card className="motion-enter motion-delay-2 shrink-0 border border-border/75 bg-surface-soft/70 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Selezionati ({selectedFoods.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {selectedFoods.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nessun alimento selezionato.</p>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    {selectedFoods.map((item) => {
                                        const unitOptions = getUnitOptions(item.product);
                                        const selectedServing = getSelectedServing(item);
                                        const computedMacros = computeItemMacros(item);

                                        return (
                                            <Card key={item.id} className="border border-border/70 bg-card shadow-none">
                                                <CardContent className="flex flex-col gap-2 p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="text-sm font-semibold leading-tight">{item.product.product_name || 'Alimento'}</p>
                                                            {item.product.brands && <p className="text-xs text-muted-foreground">{item.product.brands}</p>}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            aria-label={`Rimuovi ${item.product.product_name || 'alimento'} dalla selezione`}
                                                            onClick={() => setSelectedFoods((previous) => previous.filter((food) => food.id !== item.id))}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[11px] text-muted-foreground" htmlFor={`unit-${item.id}`}>Unità</label>
                                                            <select
                                                                id={`unit-${item.id}`}
                                                                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2"
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
                                                            <label className="text-[11px] text-muted-foreground" htmlFor={`quantity-${item.id}`}>
                                                                {selectedServing ? 'Quantità (porzioni)' : 'Quantità (g/ml)'}
                                                            </label>
                                                            <Input
                                                                id={`quantity-${item.id}`}
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

                                                    <p className="text-[11px] text-muted-foreground">
                                                        {Math.round(computedMacros.calories)} kcal • C {Math.round(computedMacros.carbs_g)}g • P {Math.round(computedMacros.proteins_g)}g • G {Math.round(computedMacros.fats_g)}g
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>

                                <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                                    Totale selezionati: {Math.round(selectedTotals.calories)} kcal • C {Math.round(selectedTotals.carbs_g)}g • P {Math.round(selectedTotals.proteins_g)}g • G {Math.round(selectedTotals.fats_g)}g
                                </div>

                                <Button onClick={() => void saveSelectedFoods()} disabled={isSaving || selectedFoods.length === 0}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Salva nel diario
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="motion-enter motion-delay-3 shrink-0 border border-border/75 bg-card shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Risultati ricerca ({searchResults.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {searchResults.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Esegui una ricerca o usa lo scanner per aggiungere alimenti.</p>
                        ) : (
                            <div className="space-y-2">
                                {searchResults.map((item, index) => (
                                    <Card key={`${item.food_id || item.product_name || 'food'}-${index}`} className="border border-border/70 bg-surface-soft/55 shadow-none">
                                        <CardContent className="flex items-center justify-between gap-2 p-3">
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 text-sm font-medium leading-snug">{item.product_name}</p>
                                                <p className="line-clamp-1 text-xs text-muted-foreground">{item.brands || 'Marca non disponibile'}</p>
                                                <p className="text-[11px] text-muted-foreground">{Math.round(getProductCaloriesPer100g(item))} kcal / 100g</p>
                                            </div>

                                            <Button size="icon" aria-label={`Aggiungi ${item.product_name || 'alimento'} alla selezione`} onClick={() => addSelectedProduct(item)}>
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Sheet open={showScanner} onOpenChange={setShowScanner}>
                <SheetContent
                    side="bottom"
                    className="h-[min(92svh,48rem)] overflow-hidden rounded-t-3xl border border-border/80 bg-card/98 p-0"
                >
                    <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                        <SheetHeader className="border-b border-border/70 px-4 pb-3 pt-4">
                            <SheetTitle>Scanner Barcode</SheetTitle>
                            <SheetDescription>
                                Inquadra il codice: il prodotto verra aggiunto ai selezionati senza comprimere la pagina.
                            </SheetDescription>
                        </SheetHeader>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
                            <BarcodeScanner onProductFound={handleScannerProductFound} />
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </main>
    );
}

export default function DiaryFoodSearchPage() {
    return (
        <Suspense
            fallback={(
                <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 pb-28">
                    <div className="motion-enter rounded-xl border border-border/75 bg-card p-4">
                        <p className="text-sm text-muted-foreground">Caricamento ricerca alimento...</p>
                    </div>
                </main>
            )}
        >
            <DiaryFoodSearchContent />
        </Suspense>
    );
}
