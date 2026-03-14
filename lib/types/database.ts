export interface Meal {
    id: string; // uuid
    time: string;
    meal_type?: 'colazione' | 'pranzo' | 'cena' | 'snack';
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
    userId: string; // Identificativo utente
    date: string; // formato YYYY-MM-DD
    metrics: {
        weight_kg?: number;
        body_fat_percentage?: number;
        sleep_hours?: number;
        subjective_energy_level?: number; // 1-10
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
    day_name: string; // es. "Lunedì"
    workout_type: string; // es. "Push", "Pull", "Rest"
    exercises: Exercise[];
}

export interface UserProfile {
    _id?: string;
    userId: string;
    name: string;
    personal_info: {
        age?: number;
        weight_kg?: number;
        height_cm?: number;
        gender?: 'M' | 'F' | 'Other';
        activity_level?: 'sedentario' | 'leggero' | 'moderato' | 'attivo' | 'molto_attivo';
    };
    targets: {
        daily_calories: number;
        daily_protein_g: number;
        daily_carbs_g: number;
        daily_fats_g: number;
        daily_water_ml: number;
    };
    workout_plan: {
        split_name: string;
        description: string;
        schedule: WorkoutDay[];
    };
    diet_plan: {
        weekly_schedule: {
            day_name: string;
            meals: {
                colazione: string[];
                pranzo: string[];
                cena: string[];
                snack: string[];
            }
        }[];
    };
    diet_rules: {
        meal_timing: string;
        preferred_foods: string[];
        forbidden_foods: string[];
        custom_notes?: string;
    };
}
