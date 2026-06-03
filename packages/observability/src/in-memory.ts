import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';

export function createInMemoryExporter(): InMemorySpanExporter {
  return new InMemorySpanExporter();
}
