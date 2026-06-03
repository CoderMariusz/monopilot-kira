import type { ErasureHandler } from './types';

export interface RegisterErasureHandlerOptions {
  force?: boolean;
}

export class DuplicateDomainError extends Error {
  readonly domain: string;

  constructor(domain: string) {
    super(`Erasure handler already registered for domain "${domain}"`);
    this.name = 'DuplicateDomainError';
    this.domain = domain;
  }
}

const domainPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;

const handlers = new Map<string, ErasureHandler>();

export function registerErasureHandler(
  domain: string,
  fn: ErasureHandler,
  opts: RegisterErasureHandlerOptions = {},
): void {
  if (!domainPattern.test(domain)) {
    throw new TypeError('domain must be a lowercase dot-string');
  }
  if (handlers.has(domain) && !opts.force) {
    throw new DuplicateDomainError(domain);
  }
  handlers.set(domain, fn);
}

export function getRegisteredHandlers(): ReadonlyMap<string, ErasureHandler> {
  return handlers;
}
