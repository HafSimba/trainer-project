import { createHmac, randomBytes } from 'node:crypto';

const FAT_SECRET_OAUTH_URL = 'https://oauth.fatsecret.com/connect/token';
const FAT_SECRET_API_BASE_URL = 'https://platform.fatsecret.com/rest';
const FAT_SECRET_METHOD_API_URL = 'https://platform.fatsecret.com/rest/server.api';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const OAUTH1_SIGNATURE_METHOD = 'HMAC-SHA1';
const OAUTH1_VERSION = '1.0';

type FatSecretAuthMode = 'oauth1' | 'oauth2';

type OAuth2Credentials = {
    clientId: string;
    clientSecret: string;
};

type OAuth1Credentials = {
    consumerKey: string;
    consumerSecret: string;
};

type TokenCache = {
    accessToken: string;
    expiresAt: number;
    scope: string;
};

type FatSecretRawServing = {
    serving_id?: string | number;
    serving_description?: string;
    serving_url?: string;
    metric_serving_amount?: string | number;
    metric_serving_unit?: string;
    number_of_units?: string | number;
    measurement_description?: string;
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
    serving_options?: FatSecretServingOption[];
};

export type FatSecretServingOption = {
    serving_id: string;
    label: string;
    number_of_units: number;
    measurement_description: string | undefined;
    metric_serving_amount: number | undefined;
    metric_serving_unit: string | undefined;
    is_default: boolean;
    nutriments: {
        calories: number;
        proteins_g: number;
        carbohydrates_g: number;
        fats_g: number;
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

function sanitizeEnvValue(value: string | undefined): string {
    if (!value) return '';

    const trimmed = value
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\r\n\t]/g, '')
        .trim();

    const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
    const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

    if ((hasDoubleQuotes || hasSingleQuotes) && trimmed.length >= 2) {
        return trimmed.slice(1, -1).trim();
    }

    return trimmed;
}

function isLikelyPlaceholder(value: string): boolean {
    if (!value) return true;

    const normalized = value.toLowerCase();
    return normalized.startsWith('inserisci_') || (value.startsWith('<') && value.endsWith('>'));
}

function buildInvalidClientHint(scope: string): string {
    return [
        'Autenticazione FatSecret fallita: invalid_client.',
        'Verifica che le credenziali siano OAuth 2.0 (non OAuth 1.0).',
        'Controlla che FAT_SECRET_API_KEY sia nel formato CLIENT_ID:CLIENT_SECRET senza spazi o virgolette.',
        `Scope richiesto da questa chiamata: ${scope}.`,
        'Se usi Vercel, verifica anche la whitelist IP/egrress richiesta da FatSecret per OAuth2.',
    ].join(' ');
}

function buildOAuth1InvalidCredentialHint(details: string): string {
    return [
        `Autenticazione FatSecret OAuth1 fallita: ${details}.`,
        'Verifica FAT_SECRET_CONSUMER_KEY e FAT_SECRET_CONSUMER_SECRET.',
        'Controlla che siano credenziali OAuth 1.0 (non OAuth 2.0).',
        'Verifica la whitelist IP su FatSecret (può richiedere fino a 24h).',
    ].join(' ');
}

function parseFatSecretOAuth2Credentials(): OAuth2Credentials | null {
    const fromPair = sanitizeEnvValue(process.env.FAT_SECRET_API_KEY);
    const directClientId = sanitizeEnvValue(process.env.FAT_SECRET_CLIENT_ID);
    const directClientSecret = sanitizeEnvValue(process.env.FAT_SECRET_CLIENT_SECRET);

    if (directClientId && directClientSecret && !isLikelyPlaceholder(directClientId) && !isLikelyPlaceholder(directClientSecret)) {
        return { clientId: directClientId, clientSecret: directClientSecret };
    }

    if (fromPair && !isLikelyPlaceholder(fromPair)) {
        const separatorIndex = fromPair.indexOf(':');

        if (separatorIndex > 0 && separatorIndex < fromPair.length - 1) {
            const clientId = fromPair.slice(0, separatorIndex).trim();
            const clientSecret = fromPair.slice(separatorIndex + 1).trim();

            if (clientId && clientSecret) {
                return { clientId, clientSecret };
            }
        }
    }

    return null;
}

function parseFatSecretOAuth1Credentials(): OAuth1Credentials | null {
    const consumerKey = sanitizeEnvValue(process.env.FAT_SECRET_CONSUMER_KEY);
    const consumerSecret = sanitizeEnvValue(process.env.FAT_SECRET_CONSUMER_SECRET);

    if (!consumerKey || !consumerSecret || isLikelyPlaceholder(consumerKey) || isLikelyPlaceholder(consumerSecret)) {
        return null;
    }

    return { consumerKey, consumerSecret };
}

function getConfiguredAuthMode(): FatSecretAuthMode {
    const rawMode = sanitizeEnvValue(process.env.FAT_SECRET_AUTH_MODE).toLowerCase();

    if (rawMode === 'oauth1' || rawMode === '1.0' || rawMode === 'oauth_1') {
        return 'oauth1';
    }

    if (rawMode === 'oauth2' || rawMode === '2.0' || rawMode === 'oauth_2') {
        return 'oauth2';
    }

    if (parseFatSecretOAuth2Credentials()) {
        return 'oauth2';
    }

    if (parseFatSecretOAuth1Credentials()) {
        return 'oauth1';
    }

    throw new Error(
        'Configurazione FatSecret mancante: imposta FAT_SECRET_CLIENT_ID/FAT_SECRET_CLIENT_SECRET (OAuth2) oppure FAT_SECRET_CONSUMER_KEY/FAT_SECRET_CONSUMER_SECRET (OAuth1).'
    );
}

function getFatSecretOAuth2Credentials(): OAuth2Credentials {
    const credentials = parseFatSecretOAuth2Credentials();
    if (credentials) {
        return credentials;
    }

    throw new Error('Configurazione FatSecret mancante: imposta FAT_SECRET_API_KEY nel formato CLIENT_ID:CLIENT_SECRET oppure FAT_SECRET_CLIENT_ID e FAT_SECRET_CLIENT_SECRET.');
}

function getFatSecretOAuth1Credentials(): OAuth1Credentials {
    const credentials = parseFatSecretOAuth1Credentials();
    if (credentials) {
        return credentials;
    }

    throw new Error('Configurazione FatSecret OAuth1 mancante: imposta FAT_SECRET_CONSUMER_KEY e FAT_SECRET_CONSUMER_SECRET.');
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

function parseFatSecretResponseBody(text: string, context: string): unknown {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(`Risposta non JSON da FatSecret (${context}). Anteprima: ${snippet || 'vuota'}`);
    }
}

function isNonJsonFatSecretError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('Risposta non JSON da FatSecret');
}

function mapPathToOAuth1Method(path: string): string | null {
    if (path === '/foods/search/v1') return 'foods.search';
    if (path === '/foods/search/v5') return 'foods.search.v5';
    if (path === '/food/v5') return 'food.get.v5';
    if (path === '/food/barcode/find-by-id/v1') return 'food.find_id_for_barcode';
    return null;
}

async function requestToken(scope: string): Promise<TokenCache> {
    const normalizedScope = normalizeScope(scope);
    const { clientId, clientSecret } = getFatSecretOAuth2Credentials();

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

        if (String(details).toLowerCase().includes('invalid_client')) {
            throw new Error(buildInvalidClientHint(normalizedScope));
        }

        throw new Error(`Autenticazione FatSecret fallita: ${details}`);
    }

    const expiresInSeconds = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 3600;

    return {
        accessToken: payload.access_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
        scope: normalizedScope,
    };
}

function oauthPercentEncode(value: string): string {
    return encodeURIComponent(value)
        .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuth1Signature(
    method: 'GET' | 'POST',
    baseUrl: string,
    parameters: Array<[string, string]>,
    consumerSecret: string
): string {
    const normalizedParameters = [...parameters]
        .sort(([keyA, valueA], [keyB, valueB]) => {
            const keyComparison = keyA.localeCompare(keyB);
            if (keyComparison !== 0) return keyComparison;
            return valueA.localeCompare(valueB);
        })
        .map(([key, value]) => `${oauthPercentEncode(key)}=${oauthPercentEncode(value)}`)
        .join('&');

    const signatureBaseString = [
        method,
        oauthPercentEncode(baseUrl),
        oauthPercentEncode(normalizedParameters),
    ].join('&');

    const signingKey = `${oauthPercentEncode(consumerSecret)}&`;
    return createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
}

function isOAuth1CredentialError(apiError: string): boolean {
    const normalizedError = apiError.toLowerCase();

    return (
        normalizedError.includes('invalid consumer key') ||
        normalizedError.includes('invalid signature') ||
        normalizedError.includes('invalid access token') ||
        normalizedError.includes('invalid/expired timestamp') ||
        normalizedError.includes('invalid/used nonce')
    );
}

async function executeOAuth1SignedGet(
    baseUrl: string,
    requestParams: Map<string, string>,
    credentials: OAuth1Credentials,
    context: string
): Promise<unknown> {
    const oauthParams = new Map<string, string>([
        ['oauth_consumer_key', credentials.consumerKey],
        ['oauth_nonce', randomBytes(16).toString('hex')],
        ['oauth_signature_method', OAUTH1_SIGNATURE_METHOD],
        ['oauth_timestamp', Math.floor(Date.now() / 1000).toString()],
        ['oauth_version', OAUTH1_VERSION],
    ]);

    const signature = buildOAuth1Signature(
        'GET',
        baseUrl,
        [...requestParams.entries(), ...oauthParams.entries()],
        credentials.consumerSecret
    );
    oauthParams.set('oauth_signature', signature);

    const finalParams = new URLSearchParams([...requestParams.entries(), ...oauthParams.entries()]);
    const response = await fetch(`${baseUrl}?${finalParams.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            Accept: 'application/json, text/plain, */*',
        },
    });

    const text = await response.text();
    const payload = parseFatSecretResponseBody(text, context);

    if (!response.ok) {
        const apiError = parseApiError(payload) || `HTTP ${response.status}`;

        if (isOAuth1CredentialError(apiError)) {
            throw new Error(buildOAuth1InvalidCredentialHint(apiError));
        }

        throw new Error(`Errore FatSecret OAuth1: ${apiError}`);
    }

    const apiError = parseApiError(payload);
    if (apiError) {
        if (isOAuth1CredentialError(apiError)) {
            throw new Error(buildOAuth1InvalidCredentialHint(apiError));
        }

        throw new Error(`Errore FatSecret OAuth1: ${apiError}`);
    }

    return payload;
}

async function fatSecretGetWithOAuth1(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    const credentials = getFatSecretOAuth1Credentials();
    const url = new URL(path, FAT_SECRET_API_BASE_URL);
    const baseUrl = `${url.origin}${url.pathname}`;

    const requestParams = new Map<string, string>();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        requestParams.set(key, String(value));
    });
    requestParams.set('format', 'json');

    try {
        return await executeOAuth1SignedGet(baseUrl, requestParams, credentials, 'OAuth1 URL');
    } catch (primaryError) {
        if (!isNonJsonFatSecretError(primaryError)) {
            throw primaryError;
        }

        const methodName = mapPathToOAuth1Method(path);
        if (!methodName) {
            throw primaryError;
        }

        const methodParams = new Map(requestParams);
        methodParams.set('method', methodName);

        try {
            return await executeOAuth1SignedGet(FAT_SECRET_METHOD_API_URL, methodParams, credentials, 'OAuth1 Method');
        } catch (fallbackError) {
            if (fallbackError instanceof Error && primaryError instanceof Error) {
                throw new Error(`${primaryError.message} | Fallback method-based fallita: ${fallbackError.message}`);
            }

            throw fallbackError;
        }
    }
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
    const authMode = getConfiguredAuthMode();

    if (authMode === 'oauth1') {
        return fatSecretGetWithOAuth1(path, params);
    }

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
        const payload = parseFatSecretResponseBody(text, 'OAuth2');

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
        return id && id !== '0' ? id : null;
    }

    if (isRecord(raw) && (typeof raw.value === 'string' || typeof raw.value === 'number')) {
        const id = String(raw.value).trim();
        return id && id !== '0' ? id : null;
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

function mapServingOptions(servings: FatSecretRawServing[]): FatSecretServingOption[] {
    return servings
        .map((serving, index) => {
            const servingId = extractFoodId(serving.serving_id) || `idx-${index}`;

            const calories = Math.max(0, toNumber(serving.calories));
            const proteins = Math.max(0, toNumber(serving.protein));
            const carbs = Math.max(0, toNumber(serving.carbohydrate));
            const fats = Math.max(0, toNumber(serving.fat));

            const hasNutrients = calories > 0 || proteins > 0 || carbs > 0 || fats > 0;
            if (!hasNutrients) {
                return null;
            }

            const metricServingAmount = toNumber(serving.metric_serving_amount);
            const metricServingUnit = (serving.metric_serving_unit || '').trim().toLowerCase();
            const numberOfUnits = toNumber(serving.number_of_units);
            const measurementDescription = (serving.measurement_description || '').trim();
            const servingDescription = (serving.serving_description || '').trim();

            const metricLabel = metricServingAmount > 0 && metricServingUnit
                ? `${Number(metricServingAmount.toFixed(2))} ${metricServingUnit}`
                : '';

            const fallbackLabel = measurementDescription
                ? `${numberOfUnits > 0 ? Number(numberOfUnits.toFixed(2)) : 1} ${measurementDescription}`.trim()
                : 'Porzione';

            const baseLabel = servingDescription || fallbackLabel;
            const label = metricLabel && !baseLabel.toLowerCase().includes(metricLabel.toLowerCase())
                ? `${baseLabel} (${metricLabel})`
                : baseLabel;

            return {
                serving_id: servingId,
                label,
                number_of_units: numberOfUnits > 0 ? Number(numberOfUnits.toFixed(2)) : 1,
                measurement_description: measurementDescription || undefined,
                metric_serving_amount: metricServingAmount > 0 ? Number(metricServingAmount.toFixed(2)) : undefined,
                metric_serving_unit: metricServingUnit || undefined,
                is_default: toNumber(serving.is_default) === 1,
                nutriments: {
                    calories: Number(calories.toFixed(2)),
                    proteins_g: Number(proteins.toFixed(2)),
                    carbohydrates_g: Number(carbs.toFixed(2)),
                    fats_g: Number(fats.toFixed(2)),
                },
            };
        })
        .filter((option): option is FatSecretServingOption => !!option)
        .sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

function normalizeProduct(food: FatSecretRawFood, detail: FatSecretRawFood | null): FatSecretProduct | null {
    const foodId = extractFoodId(detail?.food_id ?? food.food_id);
    if (!foodId) return null;

    const servings = getServings(detail || food);
    const servingOptions = mapServingOptions(servings);
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
        serving_options: servingOptions.length > 0 ? servingOptions : undefined,
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

function normalizeBarcodeToGtin13(barcode: string): string | null {
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
    if (!detail) {
        return null;
    }

    return normalizeProduct(detail, detail);
}
