import { metrics, type Meter } from '@opentelemetry/api';

const DEFAULT_METER_NAME = '@monopilot/server';

export function getMeter(name = DEFAULT_METER_NAME, version?: string): Meter {
  return metrics.getMeter(name, version);
}
