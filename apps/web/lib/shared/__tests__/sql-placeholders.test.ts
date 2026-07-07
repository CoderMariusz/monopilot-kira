import { describe, expect, it } from 'vitest';

import { assertSqlParamArity, maxSqlPlaceholderIndex } from '../sql-placeholders';

describe('sql-placeholders', () => {
  it('maxSqlPlaceholderIndex returns the highest referenced placeholder', () => {
    expect(maxSqlPlaceholderIndex('where x = $1 and y = $3 limit $5 offset $6')).toBe(6);
    expect(maxSqlPlaceholderIndex('select 1')).toBe(0);
  });

  it('assertSqlParamArity throws when params are short', () => {
    expect(() => assertSqlParamArity('where id = $1 and site = $2', ['only-one'])).toThrow(
      'SQL expects 2 params but received 1',
    );
  });

  it('assertSqlParamArity passes when lengths match', () => {
    expect(() => assertSqlParamArity('limit $5 offset $6', [1, 2, 3, 4, 50, 0])).not.toThrow();
  });
});
