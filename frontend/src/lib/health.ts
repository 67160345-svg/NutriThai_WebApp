import { Gender, ActivityLevel, Goal, HealthProfile, FoodLog, NutritionTotals } from "../types";

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function computeHealthMetrics(
  gender: Gender,
  weight: number,
  height: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: Goal
): Pick<HealthProfile, "bmr" | "tdee" | "calorieGoal" | "proteinGoal" | "carbsGoal" | "fatGoal"> {
  const bmr =
    gender === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

  const tdee = bmr * activityMultipliers[activityLevel];

  const calorieGoal =
    goal === "lose_weight" ? tdee - 500 :
    goal === "gain_muscle" ? tdee + 300 :
    tdee;

  const targetCalories = goal === "lose_weight" ? Math.max(1200, tdee - 500) : calorieGoal;
  const proteinGoal = Math.round((targetCalories * 0.25) / 4);
  const fatGoal = Math.round((targetCalories * 0.25) / 9);
  const carbsGoal = Math.round((targetCalories * 0.5) / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calorieGoal: Math.round(targetCalories),
    proteinGoal,
    carbsGoal: Math.max(carbsGoal, 50),
    fatGoal,
  };
}

export function getTotals(logs: FoodLog[]): NutritionTotals {
  return logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.food.calories * log.servings,
      protein: acc.protein + log.food.protein * log.servings,
      carbs: acc.carbs + log.food.carbs * log.servings,
      fat: acc.fat + log.food.fat * log.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export interface WorkoutSuggestion {
  name: string;
  nameTh: string;
  icon: string;
  calPerMin: number;
  color: string;
}

export const workoutSuggestions: WorkoutSuggestion[] = [
  { name: "Running", nameTh: "วิ่ง", icon: "🏃", calPerMin: 10, color: "#f59e0b" },
  { name: "Walking", nameTh: "เดิน", icon: "🚶", calPerMin: 5, color: "#10b981" },
  { name: "Cycling", nameTh: "ปั่นจักรยาน", icon: "🚴", calPerMin: 8, color: "#6366f1" },
  { name: "Swimming", nameTh: "ว่ายน้ำ", icon: "🏊", calPerMin: 9, color: "#0ea5e9" },
  { name: "Jump Rope", nameTh: "กระโดดเชือก", icon: "🤸", calPerMin: 12, color: "#ec4899" },
];
