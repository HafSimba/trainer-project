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
