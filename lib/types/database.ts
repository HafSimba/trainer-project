export type MealType = 'colazione' | 'pranzo' | 'cena' | 'snack';
export type OnboardingGender = 'Uomo' | 'Donna' | 'Altro';
export type UserGender = 'M' | 'F' | 'Other' | OnboardingGender;
export type ActivityLevel = 'sedentario' | 'leggero' | 'moderato' | 'attivo' | 'molto_attivo';

export interface Meal {
    id: string;
    time: string;
    meal_type?: MealType;
    name: string;
    calories: number;
    proteins_g: number;
    carbs_g: number;
    fats_g: number;
}

export interface TrainingSession {
    id: string;
    type: string;
    duration_minutes: number;
    calories_burned?: number;
    notes?: string;
}

export interface DailyLog {
    _id?: string;
    userId: string;
    date: string;
    metrics: {
        weight_kg?: number;
        body_fat_percentage?: number;
        sleep_hours?: number;
        subjective_energy_level?: number;
    };
    daily_nutrition_summary: {
        total_calories: number;
        total_proteins_g: number;
        total_carbs_g: number;
        total_fats_g: number;
        water_intake_ml: number;
    };
    meals_log: Meal[];
    training_log: TrainingSession[];
}

export interface Exercise {
    name: string;
    sets: number;
    reps: string | number;
    notes?: string;
}

export interface WorkoutDay {
    day_name: string;
    workout_type: string;
    exercises: Exercise[];
}

export interface NutritionTargets {
    daily_calories: number;
    daily_protein_g: number;
    daily_carbs_g: number;
    daily_fats_g: number;
    daily_water_ml: number;
}

export interface DietMeals {
    colazione: string[];
    pranzo: string[];
    cena: string[];
    snack: string[];
}

export interface DietDay {
    day_name: string;
    meals: DietMeals;
}

export interface DietPlan {
    weekly_schedule: DietDay[];
}

export interface DietRules {
    meal_timing: string;
    preferred_foods: string[];
    forbidden_foods: string[];
    custom_notes?: string;
}

export interface UserPersonalInfo {
    age?: number;
    weight_kg?: number;
    height_cm?: number;
    gender?: UserGender;
    activity_level?: ActivityLevel;
}

export interface OnboardingInput {
    name: string;
    age: number;
    gender: OnboardingGender;
    height_cm: number;
    weight_kg: number;
    attitude_consistency?: string;
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
}

export interface UserProfile {
    _id?: string;
    userId: string;
    name: string;
    onboarding_input?: OnboardingInput;
    personal_info: UserPersonalInfo;
    targets: NutritionTargets;
    workout_plan: {
        split_name: string;
        description: string;
        schedule: WorkoutDay[];
    };
    diet_plan: DietPlan;
    diet_rules: DietRules;
}
