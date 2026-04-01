import clientPromise, { COLLECTIONS, DATABASE_NAME } from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import { PROTOTYPE_USER_ID } from '@/lib/config/user';
import { getGenerationModels, getLlmClient } from '@/lib/llm/client';
import { LEGACY_PROFILE_UNSET, sanitizeLegacyProfileFields } from '@/lib/profile-legacy';
import { UserProfile } from '@/lib/types/database';

export const revalidate = 0;

const ALLOWED_GENDERS = ['Uomo', 'Donna', 'Altro'] as const;
const ALLOWED_LEVELS = ['Principiante', 'Intermedio', 'Esperto'] as const;
const ALLOWED_GOALS = ['Dimagrimento', 'Definizione', 'Mantenimento', 'Ipertrofia'] as const;
const ALLOWED_TIME = ['1 giorno/sett.', '2 giorni/sett.', '3 giorni/sett.', '4 giorni/sett.', '5 giorni/sett.', '6 giorni/sett.', '7 giorni/sett.'] as const;
const ALLOWED_EQUIPMENT = ['Corpo libero', 'Attrezzatura base in casa', 'Palestra attrezzata'] as const;
const ALLOWED_ATTITUDE_RECOVERY = ['Lento', 'Normale', 'Rapido'] as const;
const ALLOWED_ATTITUDE_STRESS = ['Basso', 'Medio', 'Alto'] as const;
const ALLOWED_ATTITUDE_INTENSITY = ['Progressivo', 'Bilanciato', 'Spinto'] as const;
const ALLOWED_ACTIVITY_LEVELS = ['sedentario', 'leggero', 'moderato', 'attivo', 'molto_attivo'] as const;
const WEEK_DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'] as const;
type AllowedGender = typeof ALLOWED_GENDERS[number];

type CanonicalOnboardingInput = {
    name: string;
    specific_goal: string;
    age: number;
    gender: AllowedGender;
    height_cm: number;
    weight_kg: number;
    attitude_recovery: string;
    attitude_stress: string;
    attitude_intensity: string;
    level: string;
    goal: string;
    available_days_per_week: number;
    available_days_label: string;
    has_food_restrictions: boolean;
    food_restrictions_notes: string;
    equipment: string;
    submitted_at: string;
};

type PlanData = {
    personal_info?: UserProfile['personal_info'];
    targets?: UserProfile['targets'];
    workout_plan?: UserProfile['workout_plan'];
    diet_plan?: UserProfile['diet_plan'];
    diet_rules?: UserProfile['diet_rules'];
};

type SafePlanData = {
    personal_info: UserProfile['personal_info'];
    targets: UserProfile['targets'];
    workout_plan: UserProfile['workout_plan'];
    diet_plan: UserProfile['diet_plan'];
    diet_rules: UserProfile['diet_rules'];
    onboarding_input: CanonicalOnboardingInput;
};

type CanonicalValidationResult =
    | { ok: true; canonicalInput: CanonicalOnboardingInput }
    | { ok: false; error: string };

type DetectedRestriction = {
    key: 'gluten_free' | 'lactose_free';
    label: string;
    forbiddenKeywords: string[];
    replacements: Array<[string, string]>;
    promptHint: string;
    fallbackFood: string;
};

function parseNumberFromUnknown(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const match = normalized.match(/-?\d+(\.\d+)?/);
        if (match) return Number(match[0]);
    }
    return NaN;
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function normalizeForMatching(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isOneOf<T extends readonly string[]>(value: string, options: T): value is T[number] {
    return options.includes(value as T[number]);
}

function toProfileGender(gender: AllowedGender): UserProfile['personal_info']['gender'] {
    if (gender === 'Uomo') return 'Uomo';
    if (gender === 'Donna') return 'Donna';
    return 'Altro';
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeJsonResponse(content: string): string {
    return content.replace(/```json/g, '').replace(/```/g, '').trim();
}

function parseAiJson(content: string, label: string): PlanData {
    const normalized = normalizeJsonResponse(content);

    try {
        return JSON.parse(normalized);
    } catch {
        const firstBrace = normalized.indexOf('{');
        const lastBrace = normalized.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const sliced = normalized.slice(firstBrace, lastBrace + 1);
            return JSON.parse(sliced);
        }

        throw new Error(`JSON ${label} non valido`);
    }
}

function buildFallbackPlan(input: CanonicalOnboardingInput): Required<PlanData> {
    const caloriesBase = Math.round(22 * input.weight_kg + (input.goal === 'Ipertrofia' ? 350 : input.goal === 'Dimagrimento' ? -300 : 0));
    const dailyCalories = clamp(caloriesBase, 1400, 4200);
    const dailyProtein = clamp(Math.round(input.weight_kg * (input.goal === 'Ipertrofia' ? 2 : 1.8)), 90, 260);
    const dailyFats = clamp(Math.round(input.weight_kg * 0.9), 45, 130);
    const dailyCarbs = Math.max(80, Math.round((dailyCalories - (dailyProtein * 4 + dailyFats * 9)) / 4));

    const workoutLabels = ['Full Body A', 'Full Body B', 'Upper', 'Lower', 'Push', 'Pull', 'Legs'];
    const schedule = WEEK_DAYS.slice(0, input.available_days_per_week).map((dayName, index) => ({
        day_name: dayName,
        workout_type: workoutLabels[index % workoutLabels.length],
        exercises: [
            { name: 'Squat o Variante', sets: 3, reps: '8-10', notes: 'Carico progressivo' },
            { name: 'Spinta Orizzontale', sets: 3, reps: '8-12', notes: 'Controllo tecnico' },
            { name: 'Trazione', sets: 3, reps: '8-12', notes: 'Range completo' },
        ],
    }));

    const breakfast = ['60g fiocchi d\'avena', '200ml latte o bevanda vegetale', '20g frutta secca'];
    const lunch = ['120g riso o pasta', '150g pollo/tacchino', '200g verdure'];
    const dinner = ['200g pesce/carne magra', '250g patate o 100g pane', '200g verdure'];
    const snack = ['170g yogurt greco', '1 frutto'];

    const weeklySchedule = WEEK_DAYS.map((dayName) => ({
        day_name: dayName,
        meals: {
            colazione: breakfast,
            pranzo: lunch,
            cena: dinner,
            snack,
        },
    }));

    return {
        personal_info: {
            age: input.age,
            gender: toProfileGender(input.gender),
            height_cm: input.height_cm,
            weight_kg: input.weight_kg,
            activity_level: 'moderato',
        },
        targets: {
            daily_calories: dailyCalories,
            daily_protein_g: dailyProtein,
            daily_carbs_g: dailyCarbs,
            daily_fats_g: dailyFats,
            daily_water_ml: 2500,
        },
        workout_plan: {
            split_name: `${input.available_days_per_week} giorni / settimana`,
            description: 'Piano fallback generato lato server in assenza di risposta AI valida.',
            schedule,
        },
        diet_plan: {
            weekly_schedule: weeklySchedule,
        },
        diet_rules: {
            meal_timing: '3 pasti + 1 snack',
            preferred_foods: ['cereali integrali', 'proteine magre', 'verdure'],
            forbidden_foods: ['ultra-processati in eccesso'],
            custom_notes: input.has_food_restrictions
                ? `Fallback plan: rigenera il piano per ottenere una versione AI completa. Restrizioni segnalate: ${input.food_restrictions_notes}.`
                : 'Fallback plan: rigenera il piano per ottenere una versione AI completa.',
        },
    };
}

function toFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return fallback;
    const sanitized = value.map((item) => normalizeString(item)).filter(Boolean);
    return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeTargets(candidate: unknown, fallback: UserProfile['targets']): UserProfile['targets'] {
    const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};

    return {
        daily_calories: Math.round(toFiniteNumber(source.daily_calories, fallback.daily_calories, 1200, 5000)),
        daily_protein_g: Math.round(toFiniteNumber(source.daily_protein_g, fallback.daily_protein_g, 50, 350)),
        daily_carbs_g: Math.round(toFiniteNumber(source.daily_carbs_g, fallback.daily_carbs_g, 50, 700)),
        daily_fats_g: Math.round(toFiniteNumber(source.daily_fats_g, fallback.daily_fats_g, 20, 220)),
        daily_water_ml: Math.round(toFiniteNumber(source.daily_water_ml, fallback.daily_water_ml, 1000, 6000)),
    };
}

function sanitizeWorkoutPlan(candidate: unknown, fallback: UserProfile['workout_plan']): UserProfile['workout_plan'] {
    const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
    const rawSchedule = Array.isArray(source.schedule) ? source.schedule : fallback.schedule;

    const schedule = rawSchedule.map((rawDay, index) => {
        const fallbackDay = fallback.schedule[index % fallback.schedule.length];
        const dayObj = rawDay && typeof rawDay === 'object' ? rawDay as Record<string, unknown> : {};
        const rawExercises = Array.isArray(dayObj.exercises) ? dayObj.exercises : fallbackDay.exercises;

        const exercises = rawExercises.map((rawExercise, exerciseIndex) => {
            const fallbackExercise = fallbackDay.exercises[exerciseIndex % fallbackDay.exercises.length];
            const exerciseObj = rawExercise && typeof rawExercise === 'object' ? rawExercise as Record<string, unknown> : {};

            return {
                name: normalizeString(exerciseObj.name) || fallbackExercise.name,
                sets: Math.round(toFiniteNumber(exerciseObj.sets, fallbackExercise.sets, 1, 8)),
                reps: normalizeString(exerciseObj.reps) || String(fallbackExercise.reps),
                notes: normalizeString(exerciseObj.notes) || fallbackExercise.notes,
            };
        }).filter((exercise) => !!exercise.name);

        return {
            day_name: normalizeString(dayObj.day_name) || fallbackDay.day_name,
            workout_type: normalizeString(dayObj.workout_type) || fallbackDay.workout_type,
            exercises: exercises.length > 0 ? exercises : fallbackDay.exercises,
        };
    }).filter((day) => !!day.day_name && !!day.workout_type);

    return {
        split_name: normalizeString(source.split_name) || fallback.split_name,
        description: normalizeString(source.description) || fallback.description,
        schedule: schedule.length > 0 ? schedule : fallback.schedule,
    };
}

function sanitizeDietPlan(candidate: unknown, fallback: UserProfile['diet_plan']): UserProfile['diet_plan'] {
    const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
    const rawWeekly = Array.isArray(source.weekly_schedule) ? source.weekly_schedule : [];

    const weeklySchedule = WEEK_DAYS.map((fallbackDayName, index) => {
        const fallbackDay = fallback.weekly_schedule[index];
        const dayObj = rawWeekly[index] && typeof rawWeekly[index] === 'object'
            ? rawWeekly[index] as Record<string, unknown>
            : {};

        const mealsObj = dayObj.meals && typeof dayObj.meals === 'object'
            ? dayObj.meals as Record<string, unknown>
            : {};

        return {
            day_name: normalizeString(dayObj.day_name) || fallbackDayName,
            meals: {
                colazione: sanitizeStringArray(mealsObj.colazione, fallbackDay.meals.colazione),
                pranzo: sanitizeStringArray(mealsObj.pranzo, fallbackDay.meals.pranzo),
                cena: sanitizeStringArray(mealsObj.cena, fallbackDay.meals.cena),
                snack: sanitizeStringArray(mealsObj.snack, fallbackDay.meals.snack),
            },
        };
    });

    return { weekly_schedule: weeklySchedule };
}

function sanitizeDietRules(candidate: unknown, fallback: UserProfile['diet_rules']): UserProfile['diet_rules'] {
    const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};

    return {
        meal_timing: normalizeString(source.meal_timing) || fallback.meal_timing,
        preferred_foods: sanitizeStringArray(source.preferred_foods, fallback.preferred_foods),
        forbidden_foods: sanitizeStringArray(source.forbidden_foods, fallback.forbidden_foods),
        custom_notes: normalizeString(source.custom_notes) || fallback.custom_notes,
    };
}

function detectDietaryRestrictions(restrictionNotes: string): DetectedRestriction[] {
    const normalizedNotes = normalizeForMatching(restrictionNotes);
    const detected: DetectedRestriction[] = [];

    const hasGlutenRestriction = /\b(celiachia|celiaco|celiaca|glutine|gluten|senza glutine|no glutine)\b/.test(normalizedNotes);
    if (hasGlutenRestriction) {
        detected.push({
            key: 'gluten_free',
            label: 'senza glutine (celiachia)',
            forbiddenKeywords: [
                'pane', 'pasta', 'farro', 'orzo', 'segale', 'couscous', 'seitan', 'fette biscottate',
                'pizza', 'panino', 'birra', 'frumento', 'grano', 'semola', 'bulgur'
            ],
            replacements: [
                ['fette biscottate', 'fette biscottate senza glutine'],
                ['pane', 'pane senza glutine'],
                ['pasta', 'pasta senza glutine'],
                ['farro', 'quinoa'],
                ['orzo', 'riso'],
                ['segale', 'riso'],
                ['couscous', 'quinoa'],
                ['seitan', 'tofu'],
                ['pizza', 'pizza senza glutine'],
                ['panino', 'panino senza glutine'],
                ['birra', 'bevanda analcolica senza glutine'],
                ['frumento', 'riso'],
                ['grano', 'riso'],
                ['semola', 'riso'],
                ['bulgur', 'riso'],
            ],
            promptHint: 'Se l’utente è celiaco o richiede senza glutine, non usare alimenti con glutine (frumento, orzo, segale, farro, couscous, pane/pasta tradizionali, seitan). Usa solo alternative senza glutine.',
            fallbackFood: 'Riso o quinoa con proteina magra (senza glutine)',
        });
    }

    const hasLactoseRestriction = /\b(lattosio|senza lattosio|no lattosio)\b/.test(normalizedNotes);
    if (hasLactoseRestriction) {
        detected.push({
            key: 'lactose_free',
            label: 'senza lattosio',
            forbiddenKeywords: ['latte', 'yogurt', 'formaggio', 'burro', 'ricotta', 'mozzarella', 'parmigiano', 'whey'],
            replacements: [
                ['latte', 'bevanda vegetale senza zuccheri'],
                ['yogurt', 'yogurt senza lattosio'],
                ['formaggio', 'formaggio senza lattosio'],
                ['burro', 'olio evo'],
                ['ricotta', 'ricotta senza lattosio'],
                ['mozzarella', 'mozzarella senza lattosio'],
                ['parmigiano', 'formaggio stagionato senza lattosio'],
                ['whey', 'proteine isolate senza lattosio'],
            ],
            promptHint: 'Se l’utente è intollerante al lattosio, evita latte e derivati con lattosio e usa equivalenti senza lattosio o vegetali.',
            fallbackFood: 'Alternativa senza lattosio con fonte proteica magra',
        });
    }

    return detected;
}

function applyReplacementsToMealItem(mealItem: string, replacements: Array<[string, string]>): string {
    let nextItem = mealItem;
    for (const [source, target] of replacements) {
        const pattern = new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi');
        nextItem = nextItem.replace(pattern, target);
    }
    return nextItem;
}

function containsForbiddenKeyword(value: string, forbiddenKeywords: string[]): boolean {
    const normalizedValue = normalizeForMatching(value);
    return forbiddenKeywords.some((keyword) => normalizedValue.includes(normalizeForMatching(keyword)));
}

function sanitizeMealListByRestrictions(mealItems: string[], restrictions: DetectedRestriction[]): string[] {
    return mealItems.map((mealItem) => {
        let nextMealItem = mealItem;

        for (const restriction of restrictions) {
            nextMealItem = applyReplacementsToMealItem(nextMealItem, restriction.replacements);
            if (containsForbiddenKeyword(nextMealItem, restriction.forbiddenKeywords)) {
                nextMealItem = `${restriction.fallbackFood}`;
            }
        }

        return nextMealItem;
    });
}

function enforceDietaryRestrictionsOnDietPlan(
    dietPlan: UserProfile['diet_plan'],
    input: CanonicalOnboardingInput
): UserProfile['diet_plan'] {
    if (!input.has_food_restrictions) return dietPlan;

    const detectedRestrictions = detectDietaryRestrictions(input.food_restrictions_notes);
    if (detectedRestrictions.length === 0) return dietPlan;

    return {
        weekly_schedule: dietPlan.weekly_schedule.map((day) => ({
            ...day,
            meals: {
                colazione: sanitizeMealListByRestrictions(day.meals.colazione, detectedRestrictions),
                pranzo: sanitizeMealListByRestrictions(day.meals.pranzo, detectedRestrictions),
                cena: sanitizeMealListByRestrictions(day.meals.cena, detectedRestrictions),
                snack: sanitizeMealListByRestrictions(day.meals.snack, detectedRestrictions),
            },
        })),
    };
}

function buildRestrictionPromptHint(input: CanonicalOnboardingInput): string {
    if (!input.has_food_restrictions) return 'Nessuna restrizione alimentare aggiuntiva.';

    const detectedRestrictions = detectDietaryRestrictions(input.food_restrictions_notes);
    if (detectedRestrictions.length === 0) {
        return `Rispetta rigorosamente questa restrizione indicata dall'utente: ${input.food_restrictions_notes}.`;
    }

    return detectedRestrictions.map((restriction) => restriction.promptHint).join(' ');
}

function mergeFoodRestrictionsIntoDietRules(
    rules: UserProfile['diet_rules'],
    input: CanonicalOnboardingInput
): UserProfile['diet_rules'] {
    if (!input.has_food_restrictions) return rules;

    const normalizedRestriction = normalizeString(input.food_restrictions_notes);
    if (!normalizedRestriction) return rules;

    const forbiddenFoods = Array.isArray(rules.forbidden_foods) ? [...rules.forbidden_foods] : [];
    const alreadyPresent = forbiddenFoods.some((item) => normalizeString(item).toLowerCase() === normalizedRestriction.toLowerCase());
    if (!alreadyPresent) {
        forbiddenFoods.push(normalizedRestriction);
    }

    const detectedRestrictions = detectDietaryRestrictions(normalizedRestriction);
    for (const restriction of detectedRestrictions) {
        for (const keyword of restriction.forbiddenKeywords) {
            const exists = forbiddenFoods.some((item) => normalizeForMatching(item) === normalizeForMatching(keyword));
            if (!exists) {
                forbiddenFoods.push(keyword);
            }
        }
    }

    const restrictionNote = `Restrizioni alimentari obbligatorie: ${normalizedRestriction}`;
    const customNotes = [normalizeString(rules.custom_notes), restrictionNote].filter(Boolean).join(' | ');

    return {
        ...rules,
        forbidden_foods: forbiddenFoods,
        custom_notes: customNotes,
    };
}

async function requestPlanPart(prompt: string, label: string): Promise<PlanData> {
    const client = getLlmClient();
    const generationModels = getGenerationModels();
    let lastError: unknown = null;

    for (const model of generationModels) {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const response = await client.chat.completions.create({
                    model,
                    messages: [{ role: 'system', content: prompt }],
                    max_tokens: 5000,
                });

                const content = response.choices[0]?.message?.content || '{}';
                return parseAiJson(content, `${label}:${model}:attempt${attempt}`);
            } catch (error) {
                lastError = error;
            }
        }
    }

    throw lastError ?? new Error(`Impossibile generare la sezione ${label}`);
}

function validateAndBuildCanonicalInput(body: unknown): CanonicalValidationResult {
    const source = isRecord(body) ? body : {};

    const username = normalizeString(source.username);
    const specificGoal = normalizeString(source.obiettivoPersonale);
    const rawGender = normalizeString(source.sesso);
    const rawLevel = normalizeString(source.livelloAttuale);
    const rawGoal = normalizeString(source.obiettivoPrimario);
    const rawTime = normalizeString(source.tempoDisponibile);
    const rawAvailabilityDays = parseNumberFromUnknown(source.disponibilitaSettimanale);
    const rawEquipment = normalizeString(source.equipaggiamento);
    const rawAttitudeRecovery = normalizeString(source.attitudineRecupero) || 'Normale';
    const rawAttitudeStress = normalizeString(source.attitudineStress) || 'Medio';
    const rawAttitudeIntensity = normalizeString(source.attitudineIntensita) || 'Bilanciato';
    const hasFoodRestrictions = source.allergiePresenti === true || normalizeString(source.allergiePresenti).toLowerCase() === 'true';
    const foodRestrictionsNotes = normalizeString(source.allergieNote);

    const age = parseNumberFromUnknown(source.eta);
    const heightCm = parseNumberFromUnknown(source.altezzaCm ?? source.altezza);
    const weightKg = parseNumberFromUnknown(source.pesoKg ?? source.peso);

    if (!username) {
        return { ok: false, error: 'Il campo nome è obbligatorio' };
    }

    if (!specificGoal) {
        return { ok: false, error: 'Il campo obiettivo personale è obbligatorio' };
    }

    if (!isOneOf(rawGender, ALLOWED_GENDERS)) {
        return { ok: false, error: 'Valore sesso non valido' };
    }

    if (!isOneOf(rawLevel, ALLOWED_LEVELS)) {
        return { ok: false, error: 'Valore livelloAttuale non valido' };
    }

    if (!isOneOf(rawGoal, ALLOWED_GOALS)) {
        return { ok: false, error: 'Valore obiettivoPrimario non valido' };
    }

    if (rawTime && !isOneOf(rawTime, ALLOWED_TIME)) {
        return { ok: false, error: 'Valore tempoDisponibile non valido' };
    }

    if (!isOneOf(rawEquipment, ALLOWED_EQUIPMENT)) {
        return { ok: false, error: 'Valore equipaggiamento non valido' };
    }

    if (!isOneOf(rawAttitudeRecovery, ALLOWED_ATTITUDE_RECOVERY)) {
        return { ok: false, error: 'Valore attitudineRecupero non valido' };
    }

    if (!isOneOf(rawAttitudeStress, ALLOWED_ATTITUDE_STRESS)) {
        return { ok: false, error: 'Valore attitudineStress non valido' };
    }

    if (!isOneOf(rawAttitudeIntensity, ALLOWED_ATTITUDE_INTENSITY)) {
        return { ok: false, error: 'Valore attitudineIntensita non valido' };
    }

    if (!Number.isFinite(age) || age < 14 || age > 90) {
        return { ok: false, error: 'Età non valida' };
    }

    if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
        return { ok: false, error: 'Altezza non valida' };
    }

    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
        return { ok: false, error: 'Peso non valido' };
    }

    let availableDays = Number.isFinite(rawAvailabilityDays) ? Math.round(rawAvailabilityDays) : NaN;
    if (!Number.isFinite(availableDays) && rawTime) {
        const availableDaysMatch = rawTime.match(/\d+/);
        availableDays = availableDaysMatch ? Number(availableDaysMatch[0]) : NaN;
    }

    if (!Number.isFinite(availableDays) || availableDays < 1 || availableDays > 7) {
        return { ok: false, error: 'Numero giorni settimanali non valido' };
    }

    if (hasFoodRestrictions && !foodRestrictionsNotes) {
        return { ok: false, error: 'Specifica le allergie o i casi alimentari indicati' };
    }

    const availableDaysLabel = isOneOf(rawTime, ALLOWED_TIME)
        ? rawTime
        : `${availableDays} ${availableDays === 1 ? 'giorno' : 'giorni'}/sett.`;

    return {
        ok: true,
        canonicalInput: {
            name: username,
            specific_goal: specificGoal,
            age,
            gender: rawGender,
            height_cm: heightCm,
            weight_kg: weightKg,
            attitude_recovery: rawAttitudeRecovery,
            attitude_stress: rawAttitudeStress,
            attitude_intensity: rawAttitudeIntensity,
            level: rawLevel,
            goal: rawGoal,
            available_days_per_week: availableDays,
            available_days_label: availableDaysLabel,
            has_food_restrictions: hasFoodRestrictions,
            food_restrictions_notes: foodRestrictionsNotes,
            equipment: rawEquipment,
            submitted_at: new Date().toISOString(),
        },
    };
}

function buildCommonContext(input: CanonicalOnboardingInput): string {
    return `Nome: ${input.name}
Obiettivo Personale Specifico: ${input.specific_goal}
Età: ${input.age}
Sesso: ${input.gender}
Altezza: ${input.height_cm} cm
Peso: ${input.weight_kg} kg
Disponibilità settimanale: ${input.available_days_per_week} giorni/sett.
Recupero: ${input.attitude_recovery}
Stress quotidiano: ${input.attitude_stress}
Propensione intensità: ${input.attitude_intensity}
Livello: ${input.level}
Obiettivo: ${input.goal}
Tempo disponibile: ${input.available_days_per_week} giorni/sett. (${input.available_days_label})
Restrizioni alimentari/allergie: ${input.has_food_restrictions ? input.food_restrictions_notes : 'Nessuna dichiarata'}
Equipaggiamento: ${input.equipment}`;
}

function buildWorkoutPrompt(input: CanonicalOnboardingInput, commonContext: string): string {
    return `Sei un AI Personal Trainer esperto.
Genera SOLO la parte di allenamento e i target calorici/macros per questo utente:
${commonContext}

REGOLE TASSATIVE:
1. Il NUMERO DI GIORNI di allenamento ("schedule") DEVE essere ESATTAMENTE ${input.available_days_per_week}.
2. In "personal_info" usa ESATTAMENTE questi dati e non modificarli:
    - age: ${input.age}
    - gender: "${input.gender}"
    - height_cm: ${input.height_cm}
    - weight_kg: ${input.weight_kg}
3. L'output deve essere SOLO E UNICAMENTE un JSON valido (privo di markdown addizionali come \`\`\`json).

STRUTTURA JSON DA RISPETTARE:
{
    "personal_info": { "age": 30, "gender": "Uomo", "height_cm": 178, "weight_kg": 78, "activity_level": "moderato" },
    "targets": { "daily_calories": 2500, "daily_protein_g": 160, "daily_carbs_g": 250, "daily_fats_g": 80, "daily_water_ml": 3000 },
    "workout_plan": {
        "split_name": "Push Pull Legs",
        "description": "Breve descrizione",
        "schedule": [
            { "day_name": "Lunedì", "workout_type": "Push", "exercises": [ { "name": "Panca", "sets": 3, "reps": "8-10", "notes": "Fermo al petto" } ] }
        ]
    }
}
NON RESTITUIRE NULL'ALTRO OLTRE L'OGGETTO JSON.`;
}

function buildDietPrompt(input: CanonicalOnboardingInput, commonContext: string, restrictionPromptHint: string): string {
    return `Sei un AI Nutrizionista esperto.
Genera SOLO la scheda alimentare completa della settimana per questo utente:
${commonContext}

REGOLE TASSATIVE:
1. "diet_plan.weekly_schedule" DEVE contenere ESATTAMENTE 7 giorni (da Lunedì a Domenica), indicando per ogni pasto gli alimenti esatti con la quantità in g/ml. Esempio pasto: ["50g Avena", "200ml Latte"].
2. L'output deve essere SOLO E UNICAMENTE un JSON valido (privo di markdown addizionali come \`\`\`json).
3. ${input.has_food_restrictions ? `ESCLUDI COMPLETAMENTE questi alimenti/condizioni: ${input.food_restrictions_notes}.` : 'Se non ci sono allergie dichiarate, mantieni il piano alimentare standard bilanciato.'}
4. ${restrictionPromptHint}

STRUTTURA JSON DA RISPETTARE:
{
    "diet_plan": {
        "weekly_schedule": [
            {
                "day_name": "Lunedì",
                "meals": {
                    "colazione": ["50g avena", "100g yogurt greco"],
                    "pranzo": ["100g riso", "150g pollo", "insalata"],
                    "cena": ["100g pane", "200g merluzzo"],
                    "snack": ["30g whey", "1 mela"]
                }
            }
        ]
    },
    "diet_rules": { "meal_timing": "3 pasti", "preferred_foods": ["riso", "pollo"], "forbidden_foods": ["fritto"] }
}
NON RESTITUIRE NULL'ALTRO OLTRE L'OGGETTO JSON.`;
}

function buildSafePlanData(
    planData: Required<PlanData>,
    fallbackPlan: Required<PlanData>,
    canonicalInput: CanonicalOnboardingInput
): SafePlanData {
    const personalInfoSource = planData.personal_info && typeof planData.personal_info === 'object'
        ? planData.personal_info
        : {};
    const rawActivityLevel = normalizeString((personalInfoSource as Record<string, unknown>).activity_level);
    const activityLevel = isOneOf(rawActivityLevel, ALLOWED_ACTIVITY_LEVELS)
        ? rawActivityLevel
        : fallbackPlan.personal_info.activity_level;

    const sanitizedDietPlan = sanitizeDietPlan(planData.diet_plan, fallbackPlan.diet_plan);
    const dietPlanWithRestrictions = enforceDietaryRestrictionsOnDietPlan(sanitizedDietPlan, canonicalInput);
    const sanitizedDietRules = sanitizeDietRules(planData.diet_rules, fallbackPlan.diet_rules);
    const dietRulesWithRestrictions = mergeFoodRestrictionsIntoDietRules(sanitizedDietRules, canonicalInput);

    return {
        personal_info: {
            age: canonicalInput.age,
            gender: toProfileGender(canonicalInput.gender),
            height_cm: canonicalInput.height_cm,
            weight_kg: canonicalInput.weight_kg,
            activity_level: activityLevel,
        },
        targets: sanitizeTargets(planData.targets, fallbackPlan.targets),
        workout_plan: sanitizeWorkoutPlan(planData.workout_plan, fallbackPlan.workout_plan),
        diet_plan: dietPlanWithRestrictions,
        diet_rules: dietRulesWithRestrictions,
        onboarding_input: canonicalInput,
    };
}

async function saveUserProfile(canonicalInput: CanonicalOnboardingInput, safePlanData: SafePlanData) {
    const mongoClient = await clientPromise;
    const db = mongoClient.db(DATABASE_NAME);
    const userProfiles = db.collection<UserProfile>(COLLECTIONS.userProfiles);

    const userProfile = sanitizeLegacyProfileFields({
        userId: PROTOTYPE_USER_ID,
        name: canonicalInput.name || 'Utente',
        ...safePlanData,
    });

    return userProfiles.findOneAndUpdate(
        { userId: PROTOTYPE_USER_ID },
        {
            $set: userProfile,
            $unset: LEGACY_PROFILE_UNSET,
        },
        { upsert: true, returnDocument: 'after' }
    );
}

function extractErrorDetails(error: unknown) {
    if (error instanceof Error) {
        const errorObject = error as Error & { code?: string | number; type?: string; status?: number };
        return {
            message: error.message || 'Errore sconosciuto',
            code: errorObject.code,
            type: errorObject.type,
            status: errorObject.status,
        };
    }

    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return {
            message: typeof record.message === 'string' ? record.message : 'Errore sconosciuto',
            code: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
            type: typeof record.type === 'string' ? record.type : undefined,
            status: typeof record.status === 'number' ? record.status : undefined,
        };
    }

    return {
        message: 'Errore sconosciuto',
        code: undefined,
        type: undefined,
        status: undefined,
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validation = validateAndBuildCanonicalInput(body);

        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const canonicalInput = validation.canonicalInput;

        const restrictionPromptHint = buildRestrictionPromptHint(canonicalInput);
        const commonContext = buildCommonContext(canonicalInput);
        const workoutPrompt = buildWorkoutPrompt(canonicalInput, commonContext);
        const dietPrompt = buildDietPrompt(canonicalInput, commonContext, restrictionPromptHint);

        const fallbackPlan = buildFallbackPlan(canonicalInput);

        const [workoutResult, dietResult] = await Promise.allSettled([
            requestPlanPart(workoutPrompt, 'workout'),
            requestPlanPart(dietPrompt, 'diet'),
        ]);

        const workoutData: PlanData = workoutResult.status === 'fulfilled'
            ? workoutResult.value
            : {
                personal_info: fallbackPlan.personal_info,
                targets: fallbackPlan.targets,
                workout_plan: fallbackPlan.workout_plan,
            };

        const dietData: PlanData = dietResult.status === 'fulfilled'
            ? dietResult.value
            : {
                diet_plan: fallbackPlan.diet_plan,
                diet_rules: fallbackPlan.diet_rules,
            };

        if (workoutResult.status === 'rejected') {
            console.error('Workout generation fallback attivato:', workoutResult.reason);
        }

        if (dietResult.status === 'rejected') {
            console.error('Diet generation fallback attivato:', dietResult.reason);
        }

        // Uniamo le due risposte in un unico grande oggetto
        const planData = {
            ...fallbackPlan,
            ...workoutData,
            ...dietData,
        };

        const safePlanData = buildSafePlanData(planData, fallbackPlan, canonicalInput);
        const result = await saveUserProfile(canonicalInput, safePlanData);

        return NextResponse.json({ success: true, profile: result });
    } catch (error: unknown) {
        console.error("Errore Gen AI:", error);
        const details = extractErrorDetails(error);
        return NextResponse.json(
            {
                error: 'Errore durante la generazione del piano con IA',
                details: process.env.NODE_ENV === 'development' ? details : undefined,
            },
            { status: 500 }
        );
    }
}
