/**
 * Shared error classes for FA Server Actions.
 *
 * These live in a plain (non-`'use server'`) module because a `'use server'`
 * file may only export async functions — Next.js `next build` rejects any
 * `export class`. The action files import these and throw/catch them exactly as
 * before; tests `instanceof`/`.code`/`.dept`/`.missingColumns` assertions rely
 * on these canonical definitions.
 */

export class AuthError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export class ValidationError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

export class DuplicateError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'DuplicateError';
    this.code = code;
  }
}

export class AuthorizationError extends Error {
  code = 'FORBIDDEN';

  constructor(message = 'Insufficient permission to set allergen overrides') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class DepartmentNotReadyError extends Error {
  code = 'DEPARTMENT_NOT_READY';
  dept: string;
  missingColumns: string[];

  constructor(dept: string, missingColumns: string[]) {
    super(
      missingColumns.length > 0
        ? `${dept} is missing required fields: ${missingColumns.join(', ')}`
        : `${dept} is not ready to close`,
    );
    this.name = 'DepartmentNotReadyError';
    this.dept = dept;
    this.missingColumns = missingColumns;
  }
}
