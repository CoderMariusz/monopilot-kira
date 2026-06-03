export {
  DuplicateDomainError,
  getRegisteredHandlers,
  registerErasureHandler,
  type RegisterErasureHandlerOptions,
} from './registry';
export { runErasure } from './dispatcher';
export type {
  ErasureContext,
  ErasureHandler,
  ErasureReason,
  ErasureResult,
  ErasureRunOptions,
  ErasureRunReport,
} from './types';
