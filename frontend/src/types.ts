export type FoodUnit = "portion" | "g" | "ml";
export interface ServingBasis {
  servingSize?: number;
  servingUnit?: FoodUnit;
  servingLabel?: string;
  portionGrams?: number | null;
}
export interface Food extends ServingBasis {
  customId?: string;
  source?: "catalog" | "ai" | "custom";
  id: number;
  name: string;
  nameTh: string;
  category: "food" | "drink" | "dessert";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
}

export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type Goal = "lose_weight" | "maintain" | "gain_muscle";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Page = "dashboard" | "logger" | "history" | "ai-scan" | "advice";

export interface HealthProfile {
  gender: Gender;
  weight: number;
  height: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  bmr: number;
  tdee: number;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
}

export interface FoodLog {
  quantity?: number;
  quantityUnit?: FoodUnit;
  replaceFood?: boolean;
  id: string;
  food: Food;
  mealType: MealType;
  servings: number;
  loggedAt: Date;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type FoodPreference = "like" | "not_interested" | "avoid";
export type FoodPreferences = Record<string, FoodPreference>;
export interface WeightLog { measuredOn: string; weightKg: number; }
export interface MealItem { food: Food; servings: number; }
