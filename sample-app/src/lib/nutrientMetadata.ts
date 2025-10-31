import { supabase } from './supabaseClient';
import type { ColumnDefinition, NutrientComponent } from '../types/nutrition';

export async function fetchNutrientComponents(): Promise<NutrientComponent[]> {
  const { data, error } = await supabase
    .from('nutrient_components')
    .select(
      'id, component_code, group_1_name_ja, group_2_name_ja, group_3_name_ja, unit, original_sort_order'
    )
    .order('original_sort_order', { ascending: true });

  if (error) {
    throw new Error(`栄養素メタデータの取得に失敗しました: ${error.message}`);
  }

  return (
    data?.map((row) => ({
      id: row.id,
      componentCode: row.component_code,
      group1NameJa: row.group_1_name_ja ?? null,
      group2NameJa: row.group_2_name_ja ?? null,
      group3NameJa: row.group_3_name_ja ?? null,
      unit: row.unit ?? null,
      originalSortOrder: row.original_sort_order ?? null
    })) ?? []
  );
}

export function buildColumnDefinitions(components: NutrientComponent[]): ColumnDefinition[] {
  const staticColumns: ColumnDefinition[] = [
    {
      key: 'food-search',
      kind: 'info',
      titles: ['食品群', null, null],
      width: 220
    },
    {
      key: 'food-code',
      kind: 'info',
      titles: ['食品番号', null, null],
      width: 120
    },
    {
      key: 'index-code',
      kind: 'info',
      titles: ['索引番号', null, null],
      width: 120
    },
    {
      key: 'food-name',
      kind: 'info',
      titles: ['可食部100g当たり', '食品名', null],
      width: 260
    },
    {
      key: 'quantity',
      kind: 'quantity',
      titles: ['可食部100g当たり', '重量 (g)', null],
      width: 120
    }
  ];

  const nutrientColumns: ColumnDefinition[] = components.map((component) => {
    const level2 = component.group1NameJa ?? null;
    let level3: string | null = null;

    if (component.group3NameJa) {
      level3 = component.group2NameJa
        ? `${component.group2NameJa} / ${component.group3NameJa}`
        : component.group3NameJa;
    } else if (component.group2NameJa) {
      level3 = component.group2NameJa;
    } else if (component.unit) {
      level3 = `(${component.unit})`;
    }

    return {
      key: `nutrient-${component.id}`,
      kind: 'nutrient',
      titles: ['可食部100g当たり', level2, level3],
      componentId: component.id,
      unit: component.unit
    };
  });

  const remarksColumn: ColumnDefinition = {
    key: 'remarks',
    kind: 'info',
    titles: ['備考', null, null],
    width: 240
  };

  return [...staticColumns, ...nutrientColumns, remarksColumn];
}
