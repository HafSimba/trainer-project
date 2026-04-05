import clientPromise, { COLLECTIONS, DATABASE_NAME } from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { USER_ID_COOKIE_NAME, resolveUserId } from '@/lib/config/user';
import { getGenerationModels, getLlmClient } from '@/lib/llm/client';
import { createConflictSafeLegacyUnset, sanitizeLegacyProfileFields } from '@/lib/profile-legacy';
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

const DEFAULT_LLM_MAX_TOKENS = 3000;
const DEFAULT_LLM_MAX_TOKENS_WORKOUT = 1800;
const DEFAULT_LLM_MAX_TOKENS_DIET = 3800;
const DEFAULT_LLM_TIMEOUT_MS = 24000;
const DEFAULT_LLM_MAX_ATTEMPTS = 2;

function parseBoundedInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
    const normalized = (rawValue || '').trim();
    if (!normalized) return fallback;

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
}

const LLM_MAX_TOKENS = parseBoundedInt(process.env.LLM_MAX_TOKENS, DEFAULT_LLM_MAX_TOKENS, 800, 5000);
const LLM_MAX_TOKENS_WORKOUT = parseBoundedInt(process.env.LLM_MAX_TOKENS_WORKOUT, DEFAULT_LLM_MAX_TOKENS_WORKOUT, 800, 5000);
const LLM_MAX_TOKENS_DIET = parseBoundedInt(process.env.LLM_MAX_TOKENS_DIET, DEFAULT_LLM_MAX_TOKENS_DIET, 1200, 5000);
const LLM_REQUEST_TIMEOUT_MS = parseBoundedInt(process.env.LLM_REQUEST_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS, 3000, 120000);
const LLM_MAX_ATTEMPTS = parseBoundedInt(process.env.LLM_MAX_ATTEMPTS, DEFAULT_LLM_MAX_ATTEMPTS, 1, 3);

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

type PlanPartAttemptMetrics = {
    model: string;
    attempt: number;
    duration_ms: number;
    success: boolean;
    retryable?: boolean;
    error_message?: string;
};

type PlanPartMetrics = {
    label: string;
    total_duration_ms: number;
    model_attempts: PlanPartAttemptMetrics[];
    used_model: string | null;
    used_attempt: number | null;
};

type PlanPartResponse = {
    planData: PlanData;
    metrics: PlanPartMetrics;
};

type GeneratePlanMetrics = {
    request_id: string;
    started_at: string;
    total_duration_ms: number;
    body_parse_ms: number;
    validation_ms: number;
    prompt_build_ms: number;
    llm_parallel_ms: number;
    merge_sanitize_ms: number;
    save_profile_ms: number;
    fallback_workout: boolean;
    fallback_diet: boolean;
    workout: PlanPartMetrics | null;
    diet: PlanPartMetrics | null;
};

class PlanPartGenerationError extends Error {
    metrics: PlanPartMetrics;

    constructor(message: string, metrics: PlanPartMetrics) {
        super(message);
        this.name = 'PlanPartGenerationError';
        this.metrics = metrics;
    }
}

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

type ExercisePool = {
    push: string[];
    pull: string[];
    legs: string[];
    core: string[];
};

function computeProfileSeed(input: CanonicalOnboardingInput): number {
    const fingerprint = [
        input.name,
        input.goal,
        input.level,
        input.equipment,
        String(input.available_days_per_week),
        input.attitude_intensity,
        input.attitude_stress,
    ].join('|');

    return Array.from(fingerprint).reduce((accumulator, currentChar) => {
        return (accumulator * 31 + currentChar.charCodeAt(0)) % 10007;
    }, 7);
}

function resolveExercisePool(equipment: string): ExercisePool {
    if (equipment === 'Palestra attrezzata') {
        return {
            push: ['Panca piana bilanciere', 'Military press manubri', 'Chest press macchina', 'Dip assistite', 'Croci ai cavi'],
            pull: ['Lat machine presa prona', 'Rematore manubrio', 'Pulley basso', 'Face pull ai cavi', 'Curl bilanciere EZ'],
            legs: ['Back squat', 'Leg press', 'Affondi camminati', 'Romanian deadlift', 'Leg curl'],
            core: ['Plank', 'Dead bug', 'Pallof press', 'Crunch su fitball'],
        };
    }

    if (equipment === 'Attrezzatura base in casa') {
        return {
            push: ['Push-up', 'Shoulder press con manubri', 'Floor press con manubri', 'Pike push-up', 'Alzate laterali'],
            pull: ['Rematore con manubri', 'Rematore con elastico', 'Pullover con manubrio', 'Curl con manubri', 'Reverse fly con elastico'],
            legs: ['Goblet squat', 'Affondi indietro', 'Hip thrust', 'Stacco rumeno con manubri', 'Step-up su panca'],
            core: ['Plank', 'Mountain climber', 'Russian twist', 'Hollow hold'],
        };
    }

    return {
        push: ['Push-up', 'Push-up inclinati', 'Dip su sedia', 'Pike push-up', 'Push-up presa stretta'],
        pull: ['Rematore inverso sotto tavolo', 'Superman hold', 'Towel row isometrico', 'Reverse snow angel', 'Curl con asciugamano isometrico'],
        legs: ['Squat a corpo libero', 'Affondi alternati', 'Bulgarian split squat', 'Glute bridge', 'Calf raise'],
        core: ['Plank', 'Side plank', 'Dead bug', 'Leg raise'],
    };
}

function resolveSplitTemplate(input: CanonicalOnboardingInput): { splitName: string; dayTypes: string[] } {
    const days = input.available_days_per_week;
    const isBeginner = input.level === 'Principiante';

    if (days <= 2) {
        return { splitName: 'Full Body Essenziale', dayTypes: ['Full Body A', 'Full Body B'] };
    }

    if (days === 3) {
        if (isBeginner) {
            return { splitName: 'Full Body Progressivo', dayTypes: ['Full Body A', 'Full Body B', 'Full Body C'] };
        }
        return { splitName: 'Push Pull Legs', dayTypes: ['Push', 'Pull', 'Legs'] };
    }

    if (days === 4) {
        return { splitName: 'Upper Lower', dayTypes: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] };
    }

    if (days === 5) {
        return { splitName: 'Push Pull Legs + Upper/Lower', dayTypes: ['Push', 'Pull', 'Legs', 'Upper', 'Lower'] };
    }

    if (days === 6) {
        return { splitName: 'PPL A/B', dayTypes: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'] };
    }

    return {
        splitName: 'Settimana Completa Bilanciata',
        dayTypes: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Conditioning'],
    };
}

function pickBySeed(options: string[], seed: number, offset: number): string {
    if (options.length === 0) return 'Esercizio base';
    const index = Math.abs(seed + offset) % options.length;
    return options[index];
}

function resolveRepRange(goal: string, dayType: string): { main: string; accessory: string } {
    if (dayType.toLowerCase().includes('conditioning')) {
        return { main: '30-45 sec', accessory: '20-30 sec' };
    }

    if (goal === 'Ipertrofia') {
        return { main: '6-10', accessory: '10-15' };
    }

    if (goal === 'Dimagrimento') {
        return { main: '10-14', accessory: '12-18' };
    }

    if (goal === 'Definizione') {
        return { main: '8-12', accessory: '12-15' };
    }

    return { main: '8-10', accessory: '10-12' };
}

function resolveSets(input: CanonicalOnboardingInput): number {
    const baseSets = input.level === 'Esperto' ? 4 : input.level === 'Intermedio' ? 3 : 2;
    const stressPenalty = input.attitude_stress === 'Alto' ? 1 : 0;
    const intensityBonus = input.attitude_intensity === 'Spinto' ? 1 : 0;
    return clamp(baseSets - stressPenalty + intensityBonus, 2, 5);
}

function buildFallbackExercisesForDay(
    dayType: string,
    input: CanonicalOnboardingInput,
    exercisePool: ExercisePool,
    seed: number,
    dayIndex: number
): UserProfile['workout_plan']['schedule'][number]['exercises'] {
    const normalizedDayType = dayType.toLowerCase();
    const sets = resolveSets(input);
    const reps = resolveRepRange(input.goal, dayType);
    const intensityNote = input.attitude_intensity === 'Spinto'
        ? 'Mantieni buffer 1-2 ripetizioni nelle serie principali.'
        : input.attitude_intensity === 'Progressivo'
            ? 'Incremento graduale dei carichi settimana dopo settimana.'
            : 'Volume bilanciato con tecnica prioritaria.';

    const byType = {
        push: [
            pickBySeed(exercisePool.push, seed, dayIndex),
            pickBySeed(exercisePool.push, seed, dayIndex + 3),
            pickBySeed(exercisePool.core, seed, dayIndex + 7),
        ],
        pull: [
            pickBySeed(exercisePool.pull, seed, dayIndex),
            pickBySeed(exercisePool.pull, seed, dayIndex + 2),
            pickBySeed(exercisePool.core, seed, dayIndex + 9),
        ],
        legs: [
            pickBySeed(exercisePool.legs, seed, dayIndex),
            pickBySeed(exercisePool.legs, seed, dayIndex + 4),
            pickBySeed(exercisePool.core, seed, dayIndex + 11),
        ],
        upper: [
            pickBySeed(exercisePool.push, seed, dayIndex),
            pickBySeed(exercisePool.pull, seed, dayIndex + 1),
            pickBySeed(exercisePool.core, seed, dayIndex + 5),
        ],
        lower: [
            pickBySeed(exercisePool.legs, seed, dayIndex),
            pickBySeed(exercisePool.legs, seed, dayIndex + 1),
            pickBySeed(exercisePool.core, seed, dayIndex + 6),
        ],
        full: [
            pickBySeed(exercisePool.legs, seed, dayIndex),
            pickBySeed(exercisePool.push, seed, dayIndex + 1),
            pickBySeed(exercisePool.pull, seed, dayIndex + 2),
            pickBySeed(exercisePool.core, seed, dayIndex + 3),
        ],
        conditioning: [
            'Circuito metabolico 20 min',
            pickBySeed(exercisePool.legs, seed, dayIndex + 1),
            pickBySeed(exercisePool.core, seed, dayIndex + 2),
        ],
    };

    const selectedTemplate = normalizedDayType.includes('push')
        ? byType.push
        : normalizedDayType.includes('pull')
            ? byType.pull
            : normalizedDayType.includes('legs')
                ? byType.legs
                : normalizedDayType.includes('upper')
                    ? byType.upper
                    : normalizedDayType.includes('lower')
                        ? byType.lower
                        : normalizedDayType.includes('conditioning')
                            ? byType.conditioning
                            : byType.full;

    return selectedTemplate.map((exerciseName, index) => ({
        name: exerciseName,
        sets,
        reps: index === selectedTemplate.length - 1 ? reps.accessory : reps.main,
        notes: index === 0 ? intensityNote : 'Esecuzione tecnica controllata e ROM completo.',
    }));
}

function buildDietTemplates(input: CanonicalOnboardingInput) {
    const proteinMain = clamp(Math.round(input.weight_kg * 1.9), 110, 240);
    const lunchCarbs = input.goal === 'Ipertrofia' ? 130 : input.goal === 'Dimagrimento' ? 80 : 105;
    const dinnerCarbs = input.goal === 'Ipertrofia' ? 110 : input.goal === 'Dimagrimento' ? 70 : 95;
    const breakfastCarbs = input.goal === 'Ipertrofia' ? 80 : input.goal === 'Dimagrimento' ? 55 : 65;
    const snackProtein = clamp(Math.round(input.weight_kg * 0.35), 20, 45);

    return {
        colazione: [
            [`${breakfastCarbs}g fiocchi d'avena`, '200ml latte o bevanda vegetale', '1 frutto'],
            [`${breakfastCarbs - 5}g pane integrale`, `${Math.round(snackProtein + 5)}g yogurt greco`, '15g frutta secca'],
            [`${breakfastCarbs}g cereali integrali`, '250ml bevanda vegetale', '20g burro di arachidi'],
            [`${breakfastCarbs - 10}g muesli`, '200g skyr', '1 banana'],
        ],
        pranzo: [
            [`${lunchCarbs}g riso basmati`, `${proteinMain}g pollo/tacchino`, '200g verdure'],
            [`${lunchCarbs - 10}g pasta`, `${Math.round(proteinMain - 20)}g tonno naturale`, '200g verdure'],
            [`${lunchCarbs - 5}g couscous`, `${Math.round(proteinMain - 10)}g legumi`, '200g ortaggi'],
            [`${lunchCarbs}g patate`, `${Math.round(proteinMain - 15)}g pesce bianco`, 'insalata mista'],
        ],
        cena: [
            [`${proteinMain}g pesce/carne magra`, `${dinnerCarbs}g pane o cereali`, '200g verdure'],
            [`${Math.round(proteinMain - 10)}g uova o albumi`, `${dinnerCarbs - 10}g riso`, 'verdure cotte'],
            [`${Math.round(proteinMain - 20)}g tofu/tempeh`, `${dinnerCarbs}g patate`, 'verdure di stagione'],
            [`${proteinMain}g carne bianca`, `${dinnerCarbs - 5}g quinoa`, 'insalata + olio EVO'],
        ],
        snack: [
            [`${snackProtein}g whey o proteine equivalenti`, '1 frutto'],
            ['170g yogurt greco', '20g frutta secca'],
            ['2 gallette di riso', `${Math.round(snackProtein + 2)}g bresaola o tacchino`],
            ['1 panino piccolo integrale', `${Math.round(snackProtein)}g hummus o ricotta`],
        ],
    };
}

function resolveActivityMultiplier(input: CanonicalOnboardingInput): number {
    const baseByDays = input.available_days_per_week >= 6
        ? 1.62
        : input.available_days_per_week >= 4
            ? 1.5
            : input.available_days_per_week >= 2
                ? 1.4
                : 1.3;

    const recoveryAdjustment = input.attitude_recovery === 'Rapido'
        ? 0.04
        : input.attitude_recovery === 'Lento'
            ? -0.04
            : 0;

    const stressAdjustment = input.attitude_stress === 'Alto'
        ? -0.05
        : input.attitude_stress === 'Basso'
            ? 0.02
            : 0;

    return clamp(baseByDays + recoveryAdjustment + stressAdjustment, 1.2, 1.8);
}

function resolveGoalCaloriesAdjustment(goal: CanonicalOnboardingInput['goal']): number {
    if (goal === 'Ipertrofia') return 260;
    if (goal === 'Dimagrimento') return -320;
    if (goal === 'Definizione') return -180;
    return 0;
}

function computeFallbackCaloriesTarget(input: CanonicalOnboardingInput): number {
    const genderOffset = input.gender === 'Uomo'
        ? 5
        : input.gender === 'Donna'
            ? -161
            : -78;

    const bmr = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + genderOffset;
    const tdee = bmr * resolveActivityMultiplier(input);
    const adjusted = Math.round(tdee + resolveGoalCaloriesAdjustment(input.goal));

    return clamp(adjusted, 1200, 4600);
}

function buildFallbackPlan(input: CanonicalOnboardingInput): Required<PlanData> {
    const seed = computeProfileSeed(input);
    const dailyCalories = computeFallbackCaloriesTarget(input);
    const dailyProtein = clamp(Math.round(input.weight_kg * (input.goal === 'Ipertrofia' ? 2.1 : input.goal === 'Dimagrimento' ? 2 : 1.8)), 90, 260);
    const dailyFats = clamp(Math.round(input.weight_kg * (input.goal === 'Dimagrimento' ? 0.8 : 0.9)), 40, 130);
    const dailyCarbs = Math.max(70, Math.round((dailyCalories - (dailyProtein * 4 + dailyFats * 9)) / 4));

    const exercisePool = resolveExercisePool(input.equipment);
    const splitTemplate = resolveSplitTemplate(input);

    const schedule = WEEK_DAYS.slice(0, input.available_days_per_week).map((dayName, index) => {
        const dayType = splitTemplate.dayTypes[index % splitTemplate.dayTypes.length];

        return {
            day_name: dayName,
            workout_type: dayType,
            exercises: buildFallbackExercisesForDay(dayType, input, exercisePool, seed, index),
        };
    });

    const dietTemplates = buildDietTemplates(input);

    const weeklySchedule = WEEK_DAYS.map((dayName, index) => {
        const rotationIndex = Math.abs(seed + index) % dietTemplates.colazione.length;

        return {
            day_name: dayName,
            meals: {
                colazione: dietTemplates.colazione[rotationIndex],
                pranzo: dietTemplates.pranzo[(rotationIndex + 1) % dietTemplates.pranzo.length],
                cena: dietTemplates.cena[(rotationIndex + 2) % dietTemplates.cena.length],
                snack: dietTemplates.snack[(rotationIndex + 3) % dietTemplates.snack.length],
            },
        };
    });

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
            split_name: `${splitTemplate.splitName} (${input.available_days_per_week} giorni/settimana)`,
            description: 'Piano fallback personalizzato lato server in assenza di risposta AI valida.',
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

function buildPlanPartMetrics(
    label: string,
    startedAtMs: number,
    attempts: PlanPartAttemptMetrics[],
    usedModel: string | null,
    usedAttempt: number | null
): PlanPartMetrics {
    return {
        label,
        total_duration_ms: Date.now() - startedAtMs,
        model_attempts: attempts,
        used_model: usedModel,
        used_attempt: usedAttempt,
    };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);

        operation
            .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

function resolveMaxTokensForLabel(label: string): number {
    if (label === 'diet') return LLM_MAX_TOKENS_DIET;
    if (label === 'workout') return LLM_MAX_TOKENS_WORKOUT;
    return LLM_MAX_TOKENS;
}

function isRetryableLlmError(error: unknown): boolean {
    const details = extractErrorDetails(error);

    if (typeof details.status === 'number') {
        if (details.status === 408 || details.status === 429) return true;
        if (details.status >= 500) return true;
    }

    const normalizedMessage = normalizeForMatching(details.message);

    return /\b(timeout|timed out|temporaneo|temporary|overload|rate limit|connection|network|socket|reset|json)\b/.test(normalizedMessage);
}

async function requestPlanPart(prompt: string, label: string): Promise<PlanPartResponse> {
    const client = getLlmClient();
    const generationModels = getGenerationModels();
    const startedAtMs = Date.now();
    const attempts: PlanPartAttemptMetrics[] = [];
    let lastError: unknown = null;

    for (const model of generationModels) {
        for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt += 1) {
            const attemptStartedAtMs = Date.now();
            const maxTokens = resolveMaxTokensForLabel(label);

            try {
                const response = await withTimeout(
                    client.chat.completions.create({
                        model,
                        messages: [
                            { role: 'system', content: 'Rispondi solo con JSON valido. Nessun testo extra.' },
                            { role: 'user', content: prompt },
                        ],
                        max_tokens: maxTokens,
                    }),
                    LLM_REQUEST_TIMEOUT_MS,
                    `Timeout generazione ${label}:${model}:attempt${attempt}`
                );

                const content = response.choices[0]?.message?.content || '{}';
                const parsed = parseAiJson(content, `${label}:${model}:attempt${attempt}`);

                attempts.push({
                    model,
                    attempt,
                    duration_ms: Date.now() - attemptStartedAtMs,
                    success: true,
                });

                return {
                    planData: parsed,
                    metrics: buildPlanPartMetrics(label, startedAtMs, attempts, model, attempt),
                };
            } catch (error) {
                lastError = error;
                const retryable = isRetryableLlmError(error);

                attempts.push({
                    model,
                    attempt,
                    duration_ms: Date.now() - attemptStartedAtMs,
                    success: false,
                    retryable,
                    error_message: extractErrorDetails(error).message,
                });

                if (!retryable) {
                    const nonRetryableMetrics = buildPlanPartMetrics(label, startedAtMs, attempts, null, null);
                    const message = error instanceof Error && error.message
                        ? error.message
                        : `Errore non retryable su ${label}:${model}`;
                    throw new PlanPartGenerationError(message, nonRetryableMetrics);
                }
            }
        }
    }

    const metrics = buildPlanPartMetrics(label, startedAtMs, attempts, null, null);
    const message = lastError instanceof Error && lastError.message
        ? lastError.message
        : `Impossibile generare la sezione ${label}`;

    throw new PlanPartGenerationError(message, metrics);
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
1.1. Mantieni output compatto: massimo 2 alimenti per pasto, niente spiegazioni narrative.
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

async function saveUserProfile(userId: string, canonicalInput: CanonicalOnboardingInput, safePlanData: SafePlanData) {
    const mongoClient = await clientPromise;
    const db = mongoClient.db(DATABASE_NAME);
    const userProfiles = db.collection<UserProfile>(COLLECTIONS.userProfiles);

    const userProfile = sanitizeLegacyProfileFields({
        userId,
        name: canonicalInput.name || 'Utente',
        ...safePlanData,
    });

    const conflictSafeLegacyUnset = createConflictSafeLegacyUnset(userProfile);
    const updatePayload = {
        $set: userProfile,
        ...(Object.keys(conflictSafeLegacyUnset).length > 0 ? { $unset: conflictSafeLegacyUnset } : {}),
    };

    return userProfiles.findOneAndUpdate(
        { userId },
        updatePayload,
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
    const requestId = randomUUID();
    const requestStartedAtMs = Date.now();
    const requestStartedAtIso = new Date(requestStartedAtMs).toISOString();
    let bodyParseMs = 0;
    let validationMs = 0;
    let promptBuildMs = 0;
    let llmParallelMs = 0;
    let mergeSanitizeMs = 0;
    let saveProfileMs = 0;

    try {
        const bodyParseStartedAtMs = Date.now();
        const body = await req.json();
        bodyParseMs = Date.now() - bodyParseStartedAtMs;

        const cookieStore = await cookies();
        const userIdFromCookie = cookieStore.get(USER_ID_COOKIE_NAME)?.value;
        const userIdFromBody = isRecord(body) ? body.userId : undefined;
        const activeUserId = resolveUserId(userIdFromBody, userIdFromCookie);

        const validationStartedAtMs = Date.now();
        const validation = validateAndBuildCanonicalInput(body);
        validationMs = Date.now() - validationStartedAtMs;

        if (!validation.ok) {
            console.warn('[generate-plan] validation failed', {
                request_id: requestId,
                started_at: requestStartedAtIso,
                body_parse_ms: bodyParseMs,
                validation_ms: validationMs,
                error: validation.error,
            });
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const canonicalInput = validation.canonicalInput;

        const promptBuildStartedAtMs = Date.now();
        const restrictionPromptHint = buildRestrictionPromptHint(canonicalInput);
        const commonContext = buildCommonContext(canonicalInput);
        const workoutPrompt = buildWorkoutPrompt(canonicalInput, commonContext);
        const dietPrompt = buildDietPrompt(canonicalInput, commonContext, restrictionPromptHint);
        promptBuildMs = Date.now() - promptBuildStartedAtMs;

        const fallbackPlan = buildFallbackPlan(canonicalInput);

        const llmParallelStartedAtMs = Date.now();
        const [workoutResult, dietResult] = await Promise.allSettled([
            requestPlanPart(workoutPrompt, 'workout'),
            requestPlanPart(dietPrompt, 'diet'),
        ]);
        llmParallelMs = Date.now() - llmParallelStartedAtMs;

        const workoutMetrics = workoutResult.status === 'fulfilled'
            ? workoutResult.value.metrics
            : workoutResult.reason instanceof PlanPartGenerationError
                ? workoutResult.reason.metrics
                : null;

        const dietMetrics = dietResult.status === 'fulfilled'
            ? dietResult.value.metrics
            : dietResult.reason instanceof PlanPartGenerationError
                ? dietResult.reason.metrics
                : null;

        const workoutData: PlanData = workoutResult.status === 'fulfilled'
            ? workoutResult.value.planData
            : {
                personal_info: fallbackPlan.personal_info,
                targets: fallbackPlan.targets,
                workout_plan: fallbackPlan.workout_plan,
            };

        const dietData: PlanData = dietResult.status === 'fulfilled'
            ? dietResult.value.planData
            : {
                diet_plan: fallbackPlan.diet_plan,
                diet_rules: fallbackPlan.diet_rules,
            };

        if (workoutResult.status === 'rejected') {
            console.error('Workout generation fallback attivato:', {
                request_id: requestId,
                reason: extractErrorDetails(workoutResult.reason),
                metrics: workoutMetrics,
            });
        }

        if (dietResult.status === 'rejected') {
            console.error('Diet generation fallback attivato:', {
                request_id: requestId,
                reason: extractErrorDetails(dietResult.reason),
                metrics: dietMetrics,
            });
        }

        const mergeSanitizeStartedAtMs = Date.now();
        // Uniamo le due risposte in un unico grande oggetto
        const planData = {
            ...fallbackPlan,
            ...workoutData,
            ...dietData,
        };

        const safePlanData = buildSafePlanData(planData, fallbackPlan, canonicalInput);
        mergeSanitizeMs = Date.now() - mergeSanitizeStartedAtMs;

        const saveProfileStartedAtMs = Date.now();
        const result = await saveUserProfile(activeUserId, canonicalInput, safePlanData);
        saveProfileMs = Date.now() - saveProfileStartedAtMs;

        const generationMetrics: GeneratePlanMetrics = {
            request_id: requestId,
            started_at: requestStartedAtIso,
            total_duration_ms: Date.now() - requestStartedAtMs,
            body_parse_ms: bodyParseMs,
            validation_ms: validationMs,
            prompt_build_ms: promptBuildMs,
            llm_parallel_ms: llmParallelMs,
            merge_sanitize_ms: mergeSanitizeMs,
            save_profile_ms: saveProfileMs,
            fallback_workout: workoutResult.status === 'rejected',
            fallback_diet: dietResult.status === 'rejected',
            workout: workoutMetrics,
            diet: dietMetrics,
        };

        console.info('[generate-plan] completed', generationMetrics);

        const generationOutcome = {
            fallback_workout: workoutResult.status === 'rejected',
            fallback_diet: dietResult.status === 'rejected',
        };

        const response = NextResponse.json({ success: true, profile: result, generation: generationOutcome });
        response.cookies.set(USER_ID_COOKIE_NAME, activeUserId, {
            path: '/',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 365,
        });
        return response;
    } catch (error: unknown) {
        const generationMetrics: GeneratePlanMetrics = {
            request_id: requestId,
            started_at: requestStartedAtIso,
            total_duration_ms: Date.now() - requestStartedAtMs,
            body_parse_ms: bodyParseMs,
            validation_ms: validationMs,
            prompt_build_ms: promptBuildMs,
            llm_parallel_ms: llmParallelMs,
            merge_sanitize_ms: mergeSanitizeMs,
            save_profile_ms: saveProfileMs,
            fallback_workout: false,
            fallback_diet: false,
            workout: null,
            diet: null,
        };

        const details = extractErrorDetails(error);
        console.error('Errore Gen AI:', {
            request_id: requestId,
            details,
            metrics: generationMetrics,
        });
        return NextResponse.json(
            {
                error: 'Errore durante la generazione del piano con IA',
                details: process.env.NODE_ENV === 'development' ? details : undefined,
            },
            { status: 500 }
        );
    }
}
