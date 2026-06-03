import { trace, type Tracer } from '@opentelemetry/api';

const DEFAULT_TRACER_NAME = '@monopilot/server';

export function getTracer(name = DEFAULT_TRACER_NAME, version?: string): Tracer {
  return trace.getTracer(name, version);
}
