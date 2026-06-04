import { Dec } from '../formulation/decimal.js';

export type NutriScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface NutriScoreResult {
  score: number;
  grade: NutriScoreGrade;
}

export type NutriScoreInput = Partial<Record<string, string | null | undefined>>;

export function nutriScore(per100g: NutriScoreInput): NutriScoreResult {
  const negative =
    negativePoints(value(per100g.energy_kj), ENERGY_THRESHOLDS) +
    negativePoints(value(per100g.sugars_g), SUGAR_THRESHOLDS) +
    negativePoints(value(per100g.saturates_g), SATURATES_THRESHOLDS) +
    negativePoints(value(per100g.sodium_mg) ?? saltToSodiumMg(value(per100g.salt_g)), SODIUM_THRESHOLDS);

  const fruitVegNutPoints = fruitVegNutScore(
    value(per100g.fruit_veg_nut_pct) ?? value(per100g.fvn_pct),
  );
  const fiberPoints = negativePoints(value(per100g.fiber_g) ?? value(per100g.fibre_g), FIBER_THRESHOLDS);
  const proteinPoints = negativePoints(value(per100g.protein_g), PROTEIN_THRESHOLDS);
  const proteinEligible = negative < 11 || fruitVegNutPoints === 5;
  const positive = fruitVegNutPoints + fiberPoints + (proteinEligible ? proteinPoints : 0);
  const score = negative - positive;

  return { score, grade: gradeForScore(score) };
}

const ENERGY_THRESHOLDS = ['335', '670', '1005', '1340', '1675', '2010', '2345', '2680', '3015', '3350'];
const SUGAR_THRESHOLDS = ['4.5', '9', '13.5', '18', '22.5', '27', '31', '36', '40', '45'];
const SATURATES_THRESHOLDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SODIUM_THRESHOLDS = ['90', '180', '270', '360', '450', '540', '630', '720', '810', '900'];
const FIBER_THRESHOLDS = ['0.9', '1.9', '2.8', '3.7', '4.7'];
const PROTEIN_THRESHOLDS = ['1.6', '3.2', '4.8', '6.4', '8'];

function value(input: string | null | undefined): Dec | undefined {
  if (input === null || input === undefined || input === '') return undefined;
  return Dec.from(input);
}

function saltToSodiumMg(salt: Dec | undefined): Dec | undefined {
  return salt?.mul(Dec.from('400'));
}

function negativePoints(valueDec: Dec | undefined, thresholds: readonly string[]): number {
  if (!valueDec) return 0;
  let score = 0;
  for (const threshold of thresholds) {
    if (valueDec.cmp(Dec.from(threshold)) > 0) score += 1;
  }
  return score;
}

function fruitVegNutScore(valueDec: Dec | undefined): number {
  if (!valueDec) return 0;
  if (valueDec.cmp(Dec.from('80')) > 0) return 5;
  if (valueDec.cmp(Dec.from('60')) > 0) return 2;
  if (valueDec.cmp(Dec.from('40')) > 0) return 1;
  return 0;
}

function gradeForScore(score: number): NutriScoreGrade {
  if (score <= -1) return 'A';
  if (score <= 2) return 'B';
  if (score <= 10) return 'C';
  if (score <= 18) return 'D';
  return 'E';
}
