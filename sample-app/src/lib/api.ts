import { supabase } from './supabaseClient';
import type { FoodGroup, FoodSearchResult, NutrientComponent, NutrientValue } from '../types/nutrition';

const SUGGESTION_LIMIT = 20;

const toFoodGroup = (row: any): FoodGroup | undefined => {
  if (!row) return undefined;

  return {
    id: row.id,
    nameJp: row.name_jp ?? '',
    groupCode: row.group_code ?? null
  };
};

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const like = `%${trimmed.replace(/[%]/g, '')}%`;

  const [foodsByName, groupMatches] = await Promise.all([
    supabase
      .from('foods')
      .select(
        `
        id,
        food_code,
        index_code,
        name_jp,
        waste_rate,
        remarks,
        food_groups:group_id ( id, name_jp, group_code )
      `
      )
      .ilike('name_jp', like)
      .order('name_jp', { ascending: true })
      .limit(SUGGESTION_LIMIT),
    supabase
      .from('food_groups')
      .select('id, name_jp, group_code')
      .ilike('name_jp', like)
      .order('group_code', { ascending: true })
      .limit(5)
  ]);

  if (foodsByName.error) {
    throw new Error(`食品検索に失敗しました: ${foodsByName.error.message}`);
  }

  const results: Record<string, FoodSearchResult> = {};

  (foodsByName.data ?? []).forEach((row: any) => {
    results[row.id] = {
      id: row.id,
      nameJp: row.name_jp ?? '',
      foodCode: row.food_code ?? null,
      indexCode: row.index_code ?? null,
      wasteRate: row.waste_rate ?? null,
      remarks: row.remarks ?? null,
      foodGroup: toFoodGroup(row.food_groups)
    };
  });

  if (!groupMatches.error && groupMatches.data?.length) {
    const groupIds = groupMatches.data.map((g: any) => g.id);

    const foodsByGroup = await supabase
      .from('foods')
      .select(
        `
        id,
        food_code,
        index_code,
        name_jp,
        waste_rate,
        remarks,
        group_id,
        food_groups:group_id ( id, name_jp, group_code )
      `
      )
      .in('group_id', groupIds)
      .order('name_jp', { ascending: true })
      .limit(SUGGESTION_LIMIT);

    if (foodsByGroup.error) {
      throw new Error(`食品群からの検索に失敗しました: ${foodsByGroup.error.message}`);
    }

    (foodsByGroup.data ?? []).forEach((row: any) => {
      if (!results[row.id]) {
        results[row.id] = {
          id: row.id,
          nameJp: row.name_jp ?? '',
          foodCode: row.food_code ?? null,
          indexCode: row.index_code ?? null,
          wasteRate: row.waste_rate ?? null,
          remarks: row.remarks ?? null,
          foodGroup: toFoodGroup(row.food_groups)
        };
      }
    });
  }

  return Object.values(results)
    .sort((a, b) => a.nameJp.localeCompare(b.nameJp, 'ja'))
    .slice(0, SUGGESTION_LIMIT);
}

export async function fetchNutrientValues(
  foodId: string,
  components: NutrientComponent[]
): Promise<Record<string, NutrientValue>> {
  const componentIds = components.map((component) => component.id);

  if (componentIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('food_nutrient_values')
    .select('component_id, value_numeric, value_raw, in_parentheses, is_tr, is_missing')
    .eq('food_id', foodId)
    .in('component_id', componentIds);

  if (error) {
    throw new Error(`栄養素データの取得に失敗しました: ${error.message}`);
  }

  const result: Record<string, NutrientValue> = {};

  (data ?? []).forEach((row: any) => {
    result[row.component_id] = {
      componentId: row.component_id,
      valueNumeric: row.value_numeric ?? null,
      valueRaw: row.value_raw ?? null,
      inParentheses: row.in_parentheses ?? false,
      isTr: row.is_tr ?? false,
      isMissing: row.is_missing ?? false
    };
  });

  return result;
}
