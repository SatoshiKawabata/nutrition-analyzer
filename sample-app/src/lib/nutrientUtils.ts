import type { NutrientValue } from '../types/nutrition';

export const parseNumericValue = (nutrient: NutrientValue | undefined): number | null => {
  if (!nutrient) return null;
  if (typeof nutrient.valueNumeric === 'number') {
    return nutrient.valueNumeric;
  }

  if (nutrient.valueRaw) {
    const parsed = Number.parseFloat(nutrient.valueRaw.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const formatScaledValue = (value: number | null, multiplier: number): string => {
  if (value === null) {
    return '';
  }

  const scaled = value * multiplier;
  if (!Number.isFinite(scaled)) {
    return '';
  }

  if (scaled === 0) {
    return '0';
  }

  if (Math.abs(scaled) >= 100) {
    return scaled.toFixed(0);
  }

  return scaled.toFixed(1);
};
