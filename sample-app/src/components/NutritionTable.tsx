import type { ColumnDefinition, FoodSearchResult, MealRow, NutrientComponent } from '../types/nutrition';
import { useMemo } from 'react';
import { FoodSearchInput } from './FoodSearchInput';
import { formatScaledValue, parseNumericValue } from '../lib/nutrientUtils';

interface HeaderCell {
  key: string;
  label: string;
  colSpan: number;
  rowSpan: number;
}

interface NutritionTableProps {
  columns: ColumnDefinition[];
  rows: MealRow[];
  nutrientComponents: NutrientComponent[];
  totals: Record<string, number>;
  totalQuantity: number;
  onSelectFood: (rowId: string, food: FoodSearchResult | undefined) => void;
  onQuantityChange: (rowId: string, quantity: number) => void;
  onRemoveRow: (rowId: string) => void;
  isLoadingMetadata: boolean;
}

const HEADER_LEVELS = 3;

const buildHeaderRows = (columns: ColumnDefinition[]): HeaderCell[][] => {
  const rows: HeaderCell[][] = Array.from({ length: HEADER_LEVELS }, () => []);

  for (let level = 0; level < HEADER_LEVELS; level += 1) {
    let index = 0;
    while (index < columns.length) {
      const title = columns[index].titles[level];
      if (!title) {
        index += 1;
        continue;
      }

      let spanIndex = index + 1;
      while (spanIndex < columns.length && columns[spanIndex].titles[level] === title) {
        spanIndex += 1;
      }

      const slice = columns.slice(index, spanIndex);
      const hasLowerLevel = slice.some((column) =>
        column.titles.slice(level + 1).some((value) => value !== null)
      );

      rows[level].push({
        key: `${level}-${index}`,
        label: title,
        colSpan: spanIndex - index,
        rowSpan: hasLowerLevel ? 1 : HEADER_LEVELS - level
      });

      index = spanIndex;
    }
  }

  return rows.filter((row) => row.length > 0);
};

export const NutritionTable = ({
  columns,
  rows,
  nutrientComponents,
  totals,
  totalQuantity,
  onSelectFood,
  onQuantityChange,
  onRemoveRow,
  isLoadingMetadata
}: NutritionTableProps) => {
  const headerRows = useMemo(() => buildHeaderRows(columns), [columns]);
  const componentMap = useMemo(
    () =>
      new Map(
        nutrientComponents.map((component) => [
          component.id,
          { name: component.group2NameJa ?? component.group1NameJa, unit: component.unit }
        ])
      ),
    [nutrientComponents]
  );

  return (
    <div className="nutrition-table__wrapper">
      <table className="nutrition-table">
        <thead>
          {headerRows.map((cells, rowIndex) => (
            <tr key={`header-${rowIndex}`}>
              {cells.map((cell) => (
                <th
                  key={cell.key}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  className="nutrition-table__header"
                >
                  {cell.label}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => {
            const multiplier = row.quantity / 100;
            return (
              <tr key={row.id}>
                {columns.map((column) => {
                  const key = column.key;
                  if (column.kind === 'info' && key === 'food-search') {
                    const content = row.food ? (
                      <>
                        <div className="nutrition-table__label">
                          {row.food.foodGroup?.nameJp ?? '食品群未設定'}
                        </div>
                        {row.food.foodGroup?.groupCode ? (
                          <div className="nutrition-table__hint">コード: {row.food.foodGroup.groupCode}</div>
                        ) : null}
                        {row.error ? (
                          <div className="nutrition-table__hint nutrition-table__hint--error">
                            {row.error}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <FoodSearchInput
                          selectedFood={row.food}
                          onSelect={(food) => onSelectFood(row.id, food)}
                          disabled={isLoadingMetadata || row.loading}
                        />
                        <div className="nutrition-table__hint nutrition-table__hint--muted">
                          食品を選択してください
                        </div>
                        {row.error ? (
                          <div className="nutrition-table__hint nutrition-table__hint--error">
                            {row.error}
                          </div>
                        ) : null}
                      </>
                    );

                    return (
                      <td key={key} className="nutrition-table__cell nutrition-table__cell--sticky">
                        <div className="nutrition-table__cell-content">
                          {row.food ? (
                            <button
                              type="button"
                              className="nutrition-table__remove-inline"
                              onClick={() => onRemoveRow(row.id)}
                              aria-label="行を削除"
                            >
                              ×
                            </button>
                          ) : null}
                          <div className="nutrition-table__cell-body">{content}</div>
                        </div>
                      </td>
                    );
                  }

                  if (column.kind === 'info' && key === 'food-code') {
                    return (
                      <td key={key} className="nutrition-table__cell">
                        {row.food?.foodCode ?? '―'}
                      </td>
                    );
                  }

                  if (column.kind === 'info' && key === 'index-code') {
                    return (
                      <td key={key} className="nutrition-table__cell">
                        {row.food?.indexCode ?? '―'}
                      </td>
                    );
                  }

                  if (column.kind === 'info' && key === 'food-name') {
                    return (
                      <td key={key} className="nutrition-table__cell nutrition-table__cell--wide">
                        {row.food ? (
                          <>
                            <div>{row.food.nameJp}</div>
                            {row.loading ? (
                              <div className="nutrition-table__hint">栄養データを取得中…</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="nutrition-table__hint nutrition-table__hint--muted">
                            ―
                          </span>
                        )}
                      </td>
                    );
                  }

                  if (column.kind === 'quantity') {
                    return (
                      <td key={key} className="nutrition-table__cell">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={Number.isFinite(row.quantity) ? row.quantity : ''}
                          disabled={!row.food}
                          className="nutrition-table__quantity"
                          onChange={(event) => {
                            const next = event.target.valueAsNumber;
                            if (Number.isFinite(next)) {
                              onQuantityChange(row.id, next);
                            }
                          }}
                        />
                      </td>
                    );
                  }

                  if (column.kind === 'nutrient' && column.componentId) {
                    const nutrient = row.nutrients[column.componentId];
                    if (!nutrient) {
                      return (
                        <td key={key} className="nutrition-table__cell">
                          {row.loading ? '…' : ''}
                        </td>
                      );
                    }

                    if (nutrient.isMissing) {
                      return (
                        <td key={key} className="nutrition-table__cell nutrition-table__cell--muted">
                          ―
                        </td>
                      );
                    }

                    if (nutrient.isTr) {
                      return (
                        <td key={key} className="nutrition-table__cell nutrition-table__cell--muted">
                          tr
                        </td>
                      );
                    }

                    const numericValue = parseNumericValue(nutrient);
                    const display = formatScaledValue(numericValue, multiplier);

                    return (
                      <td key={key} className="nutrition-table__cell">
                        {nutrient.inParentheses ? `(${display})` : display}
                      </td>
                    );
                  }

                  if (column.kind === 'info' && key === 'remarks') {
                    return (
                      <td key={key} className="nutrition-table__cell nutrition-table__cell--remarks">
                        {row.food?.remarks ?? '―'}
                      </td>
                    );
                  }

                  return (
                    <td key={key} className="nutrition-table__cell">
                      ―
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((column, index) => {
              if (column.kind === 'info' && column.key === 'food-search') {
                return (
                  <th key={column.key} className="nutrition-table__footer">
                    合計
                  </th>
                );
              }

              if (column.kind === 'quantity') {
                return (
                  <th key={column.key} className="nutrition-table__footer">
                    {totalQuantity ? `${totalQuantity.toFixed(1)} g` : '―'}
                  </th>
                );
              }

              if (column.kind === 'nutrient' && column.componentId) {
                const total = totals[column.componentId];
                const component = componentMap.get(column.componentId);
                const formatted = typeof total === 'number' ? formatScaledValue(total, 1) : '―';
                return (
                  <th key={column.key} className="nutrition-table__footer">
                    {formatted}
                    {component?.unit ? <span className="nutrition-table__unit">{component.unit}</span> : null}
                  </th>
                );
              }

              return (
                <th key={`${column.key}-${index}`} className="nutrition-table__footer">
                  &nbsp;
                </th>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
