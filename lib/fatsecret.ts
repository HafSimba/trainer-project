const FAT_SECRET_OAUTH_URL = 'https://oauth.fatsecret.com/connect/token';
const FAT_SECRET_API_BASE_URL = 'https://platform.fatsecret.com/rest';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

type TokenCache = {
    accessToken: string;
    expiresAt: number;
    scope: string;
};

type FatSecretRawServing = {
    serving_id?: string | number;
    metric_serving_amount?: string | number;
    metric_serving_unit?: string;
    calories?: string | number;
    carbohydrate?: string | number;
    protein?: string | number;
    fat?: string | number;
    is_default?: string | number;
};

type FatSecretRawFood = {
    food_id?: string | number;
    food_name?: string;
    brand_name?: string;
    food_description?: string;
    servings?: {
        serving?: FatSecretRawServing | FatSecretRawServing[];
    };
};

export type FatSecretProduct = {
    food_id: string;
    product_name: string;
    brands?: string;
    nutriments: {
        'energy-kcal_100g': number;
        proteins_100g: number;
        carbohydrates_100g: number;
        fat_100g: number;
    };
};

let tokenCache: TokenCache | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function toArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function normalizeScope(scope: string): string {
    const parts = scope
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) return 'basic';

    return Array.from(new Set(parts)).sort().join(' ');
}

function getFatSecretCredentials(): { clientId: string; clientSecret: string } {
    const fromPair = process.env.FAT_SECRET_API_KEY?.trim();
    const directClientId = process.env.FAT_SECRET_CLIENT_ID?.trim();
    const directClientSecret = process.env.FAT_SECRET_CLIENT_SECRET?.trim();

    if (directClientId && directClientSecret) {
        return { clientId: directClientId, clientSecret: directClientSecret };
    }

    if (fromPair) {
        const separatorIndex = fromPair.indexOf(':');

        if (separatorIndex > 0 && separatorIndex < fromPair.length - 1) {
            const clientId = fromPair.slice(0, separatorIndex).trim();
            const clientSecret = fromPair.slice(separatorIndex + 1).trim();

            if (clientId && clientSecret) {
                return { clientId, clientSecret };
            }
        }
    }

    throw new Error('Configurazione FatSecret mancante: imposta FAT_SECRET_API_KEY nel formato CLIENT_ID:CLIENT_SECRET oppure FAT_SECRET_CLIENT_ID e FAT_SECRET_CLIENT_SECRET.');
}

function parseApiError(payload: unknown): string | null {
    if (!isRecord(payload)) return null;

    const rawError = payload.error;

    if (typeof rawError === 'string' && rawError.trim()) {
        return rawError;
    }

    if (isRecord(rawError)) {
        const code = typeof rawError.code === 'number' || typeof rawError.code === 'string' ? String(rawError.code) : '';
        const message = typeof rawError.message === 'string' ? rawError.message : '';

        if (code || message) {
            return [code, message].filter(Boolean).join(' - ');
        }
    }

    return null;
}

async function requestToken(scope: string): Promise<TokenCache> {
    const normalizedScope = normalizeScope(scope);
    const { clientId, clientSecret } = getFatSecretCredentials();

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('scope', normalizedScope);

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(FAT_SECRET_OAUTH_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        cache: 'no-store',
    });

    const payload = await response.json().catch(() => null) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
    } | null;

    if (!response.ok || !payload?.access_token) {
        const details = payload?.error_description || payload?.error || `HTTP ${response.status}`;
        throw new Error(`Autenticazione FatSecret fallita: ${details}`);
    }

    const expiresInSeconds = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 3600;

    return {
        accessToken: payload.access_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
        scope: normalizedScope,
    };
}

async function getToken(scope: string): Promise<string> {
    const normalizedScope = normalizeScope(scope);

    if (
        tokenCache &&
        tokenCache.scope === normalizedScope &&
        Date.now() < tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS
    ) {
        return tokenCache.accessToken;
    }

    tokenCache = await requestToken(normalizedScope);
    return tokenCache.accessToken;
}

async function fatSecretGet(path: string, params: Record<string, string | number | undefined>, scope: string): Promise<unknown> {
    const request = async (forceRefreshToken: boolean): Promise<unknown> => {
        if (forceRefreshToken) {
            tokenCache = null;
        }

        const accessToken = await getToken(scope);
        const url = new URL(path, FAT_SECRET_API_BASE_URL);

        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            url.searchParams.set(key, String(value));
        });

        url.searchParams.set('format', 'json');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            cache: 'no-store',
        });

        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;

        if ((response.status === 401 || response.status === 403) && !forceRefreshToken) {
            return request(true);
        }

        if (!response.ok) {
            const apiError = parseApiError(payload);
            throw new Error(apiError || `Errore FatSecret (${response.status})`);
        }

        const apiError = parseApiError(payload);
        if (apiError) {
            throw new Error(apiError);
        }

        return payload;
    };

    return request(false);
}

function extractFoodId(raw: unknown): string | null {
    if (typeof raw === 'string' || typeof raw === 'number') {
        const id = String(raw).trim();
        return id ? id : null;
    }

    if (isRecord(raw) && (typeof raw.value === 'string' || typeof raw.value === 'number')) {
        const id = String(raw.value).trim();
        return id ? id : null;
    }

    return null;
}

function extractSearchFoods(payload: unknown): FatSecretRawFood[] {
    if (!isRecord(payload)) return [];

    const fromV1 = isRecord(payload.foods) ? payload.foods : null;
    if (fromV1) {
        return toArray((fromV1 as { food?: FatSecretRawFood | FatSecretRawFood[] }).food);
    }

    const fromV5Root = isRecord(payload.foods_search) ? payload.foods_search : null;
    const fromV5Results = fromV5Root && isRecord(fromV5Root.results) ? fromV5Root.results : null;
    if (fromV5Results) {
        return toArray((fromV5Results as { food?: FatSecretRawFood | FatSecretRawFood[] }).food);
    }

    if (isRecord(payload.results)) {
        return toArray((payload.results as { food?: FatSecretRawFood | FatSecretRawFood[] }).food);
    }

    return [];
}

function extractFoodDetails(payload: unknown): FatSecretRawFood | null {
    if (!isRecord(payload)) return null;

    if (isRecord(payload.food)) {
        return payload.food as FatSecretRawFood;
    }

    return payload as FatSecretRawFood;
}

function getServings(food: FatSecretRawFood | null | undefined): FatSecretRawServing[] {
    if (!food?.servings || !isRecord(food.servings)) return [];
    return toArray(food.servings.serving);
}

function chooseServing(servings: FatSecretRawServing[]): FatSecretRawServing | null {
    if (servings.length === 0) return null;

    const metric100Serving = servings.find((serving) => {
        const unit = (serving.metric_serving_unit || '').toLowerCase();
        const amount = toNumber(serving.metric_serving_amount);
        return (unit === 'g' || unit === 'ml') && Math.abs(amount - 100) < 0.0001;
    });

    if (metric100Serving) return metric100Serving;

    const derivedServing = servings.find((serving) => String(serving.serving_id) === '0');
    if (derivedServing) return derivedServing;

    const defaultServing = servings.find((serving) => toNumber(serving.is_default) === 1);
    if (defaultServing) return defaultServing;

    return servings[0];
}

function parseDescriptionNutriments(description: string | undefined): FatSecretProduct['nutriments'] {
    const text = (description || '').toLowerCase();

    const pick = (pattern: RegExp): number => {
        const match = text.match(pattern);
        return match?.[1] ? toNumber(match[1]) : 0;
    };

    return {
        'energy-kcal_100g': pick(/calories\s*:\s*([\d.,]+)\s*kcal/i),
        fat_100g: pick(/fat\s*:\s*([\d.,]+)\s*g/i),
        carbohydrates_100g: pick(/carbs?\s*:\s*([\d.,]+)\s*g/i),
        proteins_100g: pick(/protein\s*:\s*([\d.,]+)\s*g/i),
    };
}

function servingToNutriments(serving: FatSecretRawServing | null): FatSecretProduct['nutriments'] {
    if (!serving) {
        return {
            'energy-kcal_100g': 0,
            proteins_100g: 0,
            carbohydrates_100g: 0,
            fat_100g: 0,
        };
    }

    const calories = toNumber(serving.calories);
    const protein = toNumber(serving.protein);
    const carbs = toNumber(serving.carbohydrate);
    const fat = toNumber(serving.fat);
    const metricAmount = toNumber(serving.metric_serving_amount);
    const metricUnit = (serving.metric_serving_unit || '').toLowerCase();

    const shouldNormalizeTo100 = (metricUnit === 'g' || metricUnit === 'ml') && metricAmount > 0;
    const multiplier = shouldNormalizeTo100 ? 100 / metricAmount : 1;

    return {
        'energy-kcal_100g': calories * multiplier,
        proteins_100g: protein * multiplier,
        carbohydrates_100g: carbs * multiplier,
        fat_100g: fat * multiplier,
    };
}

function roundNutriments(nutriments: FatSecretProduct['nutriments']): FatSecretProduct['nutriments'] {
    return {
        'energy-kcal_100g': Math.max(0, Number(nutriments['energy-kcal_100g'].toFixed(2))),
        proteins_100g: Math.max(0, Number(nutriments.proteins_100g.toFixed(2))),
        carbohydrates_100g: Math.max(0, Number(nutriments.carbohydrates_100g.toFixed(2))),
        fat_100g: Math.max(0, Number(nutriments.fat_100g.toFixed(2))),
    };
}

function normalizeProduct(food: FatSecretRawFood, detail: FatSecretRawFood | null): FatSecretProduct | null {
    const foodId = extractFoodId(detail?.food_id ?? food.food_id);
    if (!foodId) return null;

    const servings = getServings(detail || food);
    const chosenServing = chooseServing(servings);

    const servingNutriments = servingToNutriments(chosenServing);
    const hasServingNutrients =
        servingNutriments['energy-kcal_100g'] > 0 ||
        servingNutriments.proteins_100g > 0 ||
        servingNutriments.carbohydrates_100g > 0 ||
        servingNutriments.fat_100g > 0;

    const fallbackNutriments = parseDescriptionNutriments(food.food_description);
    const nutriments = roundNutriments(hasServingNutrients ? servingNutriments : fallbackNutriments);

    return {
        food_id: foodId,
        product_name: detail?.food_name || food.food_name || 'Prodotto FatSecret',
        brands: detail?.brand_name || food.brand_name || '',
        nutriments,
    };
}

async function getFoodById(foodId: string, scope = 'basic'): Promise<FatSecretRawFood | null> {
    const payload = await fatSecretGet('/food/v5', { food_id: foodId }, scope);
    return extractFoodDetails(payload);
}

export async function searchFatSecretFoods(query: string, limit = 10): Promise<FatSecretProduct[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 20);

    const payload = await fatSecretGet(
        '/foods/search/v1',
        {
            search_expression: query,
            max_results: normalizedLimit,
            page_number: 0,
        },
        'basic'
    );

    const foods = extractSearchFoods(payload);

    const enriched = await Promise.all(
        foods.slice(0, normalizedLimit).map(async (food) => {
            const foodId = extractFoodId(food.food_id);
            if (!foodId) return normalizeProduct(food, null);

            try {
                const detail = await getFoodById(foodId, 'basic');
                return normalizeProduct(food, detail);
            } catch {
                return normalizeProduct(food, null);
            }
        })
    );

    return enriched.filter((item): item is FatSecretProduct => !!item);
}

export function normalizeBarcodeToGtin13(barcode: string): string | null {
    const digits = barcode.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length > 13) return null;
    return digits.padStart(13, '0');
}

export async function findFatSecretFoodByBarcode(barcode: string): Promise<FatSecretProduct | null> {
    const normalizedBarcode = normalizeBarcodeToGtin13(barcode);
    if (!normalizedBarcode) {
        return null;
    }

    const payload = await fatSecretGet(
        '/food/barcode/find-by-id/v1',
        { barcode: normalizedBarcode },
        'basic barcode'
    );

    const responseRecord = isRecord(payload) ? payload : null;
    const foodId = extractFoodId(responseRecord?.food_id);

    if (!foodId) {
        return null;
    }

    const detail = await getFoodById(foodId, 'basic barcode');
    if (!detail) return null;

    return normalizeProduct(detail, detail);
}
