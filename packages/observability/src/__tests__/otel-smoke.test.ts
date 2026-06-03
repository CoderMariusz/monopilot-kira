import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryExporter } from '../in-memory.js';
import { getTracer } from '../tracer.js';
import { resetNodeSdkForTests, startNodeSdk } from '../sdk-node.js';

describe('@monopilot/observability', () => {
  afterEach(async () => {
    delete process.env.OTEL_SDK_DISABLED;
    await resetNodeSdkForTests();
    vi.restoreAllMocks();
  });

  it('exports a callable tracer', () => {
    const tracer = getTracer('@monopilot/server');

    expect(tracer.startActiveSpan).toEqual(expect.any(Function));
  });

  it('exports spans to an in-memory exporter', async () => {
    const exporter = createInMemoryExporter();
    const sdk = startNodeSdk({
      serviceName: 'monopilot-test',
      spanExporter: exporter,
    });

    const tracer = getTracer('@monopilot/server');
    tracer.startActiveSpan('test.smoke', (span) => {
      span.setAttribute('foo', 'bar');
      span.end();
    });

    await expect.poll(() => exporter.getFinishedSpans().length).toBe(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('test.smoke');
    expect(spans[0]?.attributes.foo).toBe('bar');

    await sdk.shutdown();
  });

  it('returns a no-op sdk when OpenTelemetry is disabled', async () => {
    process.env.OTEL_SDK_DISABLED = 'true';
    const exporter = createInMemoryExporter();

    const sdk = startNodeSdk({ serviceName: 'disabled-test', spanExporter: exporter });
    const tracer = getTracer('@monopilot/server');
    tracer.startActiveSpan('disabled.smoke', (span) => {
      span.end();
    });

    expect(sdk.start).toEqual(expect.any(Function));
    expect(sdk.shutdown).toEqual(expect.any(Function));
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
