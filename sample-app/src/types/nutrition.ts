export interface FoodGroup {
  id: string;
  nameJp: string;
  groupCode: string | null;
}

export interface FoodSearchResult {
  id: string;
  nameJp: string;
  foodCode: string | null;
  indexCode: string | null;
  wasteRate: number | null;
  remarks: string | null;
  foodGroup?: FoodGroup;
}

export interface NutrientComponent {
  id: string;
  componentCode: string;
  group1NameJa: string | null;
  group2NameJa: string | null;
  group3NameJa: string | null;
  unit: string | null;
  originalSortOrder: number | null;
}

export interface NutrientValue {
  componentId: string;
  valueNumeric: number | null;
  valueRaw: string | null;
  inParentheses: boolean;
  isTr: boolean;
  isMissing: boolean;
}

export type ColumnKind = 'info' | 'quantity' | 'nutrient' | 'actions';

export interface ColumnDefinition {
  key: string;
  kind: ColumnKind;
  titles: [string | null, string | null, string | null];
  width?: number;
  componentId?: string;
  unit?: string | null;
}

export interface MealRow {
  id: string;
  quantity: number;
  food?: FoodSearchResult;
  nutrients: Record<string, NutrientValue | undefined>;
  loading: boolean;
  error?: string;
}
