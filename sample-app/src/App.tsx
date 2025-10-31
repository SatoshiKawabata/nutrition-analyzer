import { useEffect, useMemo, useState } from 'react';
import { buildColumnDefinitions, fetchNutrientComponents } from './lib/nutrientMetadata';
import { fetchNutrientValues } from './lib/api';
import { NutritionTable } from './components/NutritionTable';
import type {
  ColumnDefinition,
  FoodSearchResult,
  MealRow,
  NutrientComponent,
  NutrientValue
} from './types/nutrition';
import { parseNumericValue } from './lib/nutrientUtils';

const DEFAULT_QUANTITY = 100;

const generateRowId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyRow = (): MealRow => ({
  id: generateRowId(),
  quantity: DEFAULT_QUANTITY,
  nutrients: {},
  loading: false
});

const mergeNutrients = (
  existing: Record<string, NutrientValue | undefined>,
  next: Record<string, NutrientValue>
) => ({ ...existing, ...next });

function App() {
  const [nutrientComponents, setNutrientComponents] = useState<NutrientComponent[]>([]);
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => buildColumnDefinitions([]));
  const [rows, setRows] = useState<MealRow[]>(() => [createEmptyRow()]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoadingMetadata(true);
        const components = await fetchNutrientComponents();
        setNutrientComponents(components);
        setColumns(buildColumnDefinitions(components));
        setMetadataError(null);
      } catch (error) {
        setMetadataError(
          error instanceof Error ? error.message : '栄養素メタデータの取得に失敗しました'
        );
      } finally {
        setLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, []);

  const handleSelectFood = async (rowId: string, food: FoodSearchResult | undefined) => {
    setRows((prev) => {
      const nextRows = prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              food,
              quantity: DEFAULT_QUANTITY,
              nutrients: {},
              loading: Boolean(food),
              error: undefined
            }
          : row
      );

      if (food) {
        const hasDraftRow = nextRows.some((row) => !row.food);
        if (!hasDraftRow) {
          return [...nextRows, createEmptyRow()];
        }
      }

      return nextRows;
    });

    if (!food) {
      return;
    }

    if (!nutrientComponents.length) {
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                loading: false,
                error: '栄養素メタデータがまだ準備できていません'
              }
            : row
        )
      );
      return;
    }

    try {
      const nutrientValues = await fetchNutrientValues(food.id, nutrientComponents);
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                nutrients: mergeNutrients(row.nutrients, nutrientValues),
                loading: false,
                error: undefined
              }
            : row
        )
      );
    } catch (error) {
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                loading: false,
                error: error instanceof Error ? error.message : '栄養素データの取得に失敗しました'
              }
            : row
        )
      );
    }
  };

  const handleQuantityChange = (rowId: string, quantity: number) => {
    const safeQuantity = Math.max(quantity, 0);
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, quantity: safeQuantity } : row))
    );
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => {
      const filtered = prev.filter((row) => row.id !== rowId);
      if (filtered.length === 0) {
        return [createEmptyRow()];
      }

      const hasDraftRow = filtered.some((row) => !row.food);
      return hasDraftRow ? filtered : [...filtered, createEmptyRow()];
    });
  };

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row) => {
      if (!row.food || !row.nutrients) return;
      const multiplier = row.quantity / 100;
      Object.entries(row.nutrients).forEach(([componentId, nutrient]) => {
        if (!nutrient || nutrient.isMissing || nutrient.isTr) return;
        const numeric = parseNumericValue(nutrient);
        if (numeric === null) return;
        map[componentId] = (map[componentId] ?? 0) + numeric * multiplier;
      });
    });
    return map;
  }, [rows]);

  const totalQuantity = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (!row.food) return sum;
        return sum + row.quantity;
      }, 0),
    [rows]
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">栄養価計算サンプルアプリ</h1>
        <p className="app__subtitle">食品を検索し、摂取量を入力すると主要栄養素を集計します。</p>
      </header>

      {metadataError ? (
        <div className="app__alert app__alert--error">{metadataError}</div>
      ) : null}

      <NutritionTable
        columns={columns}
        rows={rows}
        nutrientComponents={nutrientComponents}
        totals={totals}
        totalQuantity={totalQuantity}
        onSelectFood={handleSelectFood}
        onQuantityChange={handleQuantityChange}
        onRemoveRow={handleRemoveRow}
        isLoadingMetadata={loadingMetadata}
      />

      <section className="app__info">
        <h2>使い方</h2>
        <ol>
          <li>左端の検索欄から食品名または食品群名を入力します。</li>
          <li>候補を選択すると 100 g あたりの栄養素が列に表示されます。</li>
          <li>必要に応じて重量 (g) を変更すると、栄養価が自動換算されます。</li>
          <li>食品を選択すると次の入力行が自動で追加されます。不要な行は「削除」で取り除けます。</li>
        </ol>
        <p className="app__disclaimer">
          栄養値は Supabase 上の日本食品標準成分表（八訂・増補 2023）データを元に換算しています。
        </p>
      </section>
    </div>
  );
}

export default App;
