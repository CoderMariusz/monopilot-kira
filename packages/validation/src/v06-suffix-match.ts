export type V06SuffixMatchInput = {
  recipeComponents: string | null | undefined;
  intermediateCodeFinal: string | null | undefined;
};

export type V06SuffixMatchResult =
  | {
      status: 'PASS';
    }
  | {
      status: 'WARN';
      severity: 'WARN';
      code: 'V06';
      message: string;
    };

const MESSAGE = 'Recipe component suffix does not match the final intermediate suffix.';

function lastNonWhitespaceChar(value: string | null | undefined): string | null {
  const match = value?.trim().match(/\S$/u);
  return match?.[0]?.toUpperCase() ?? null;
}

function lastProcessSuffix(intermediateCodeFinal: string | null | undefined): string | null {
  if (!intermediateCodeFinal) return null;

  const parts = intermediateCodeFinal.trim().split('-').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'WIP') return null;

  const maybeSequence = parts.at(-1);
  if (!maybeSequence || !/^\d+$/.test(maybeSequence)) return null;

  return parts.at(-2)?.toUpperCase() ?? null;
}

export function validateSuffixMatchV06(input: V06SuffixMatchInput): V06SuffixMatchResult {
  const recipeLastChar = lastNonWhitespaceChar(input.recipeComponents);
  const suffix = lastProcessSuffix(input.intermediateCodeFinal);
  const suffixLastChar = lastNonWhitespaceChar(suffix);

  if (!recipeLastChar || !suffixLastChar || recipeLastChar === suffixLastChar) {
    return { status: 'PASS' };
  }

  return {
    status: 'WARN',
    severity: 'WARN',
    code: 'V06',
    message: MESSAGE,
  };
}
