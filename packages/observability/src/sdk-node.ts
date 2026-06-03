import {
  context,
  metrics,
  propagation,
  trace,
  type Context,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
export type StartNodeSdkOptions = {
  serviceName?: string;
  otlpEndpoint?: string;
  resourceAttributes?: Record<string, string>;
  spanExporter?: SpanExporter;
};

const SERVICE_VERSION = '0.0.0';
const DEFAULT_SERVICE_NAME = 'monopilot';
const ATTR_SERVICE_NAME = 'service.name';
const ATTR_SERVICE_VERSION = 'service.version';
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

let startedSdk: NodeSDK | undefined;

const noopSdk = {
  start: () => {},
  shutdown: async () => {},
};

const allowedSpanAttributes = new Set([
  'foo',
  'db.name',
  'db.operation',
  'db.operation.name',
  'db.system',
  'db.system.name',
  'deployment.environment',
  'error.type',
  'http.method',
  'http.request.method',
  'http.response.status_code',
  'http.route',
  'http.scheme',
  'http.status_code',
  'net.host.name',
  'net.host.port',
  'net.peer.name',
  'net.peer.port',
  'rpc.method',
  'rpc.service',
  'rpc.system',
  'server.address',
  'server.port',
  'service.name',
  'service.version',
  'url.path',
  'url.scheme',
]);

const allowedSpanAttributePrefixes = ['otel.', 'telemetry.sdk.'];

function isAllowedSpanAttribute(key: string): boolean {
  return (
    allowedSpanAttributes.has(key) ||
    allowedSpanAttributePrefixes.some((prefix) => key.startsWith(prefix))
  );
}

class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    for (const key of Object.keys(span.attributes)) {
      if (!isAllowedSpanAttribute(key)) {
        delete span.attributes[key];
      }
    }

    this.delegate.onEnd(span);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}

function buildTraceExporter(opts: StartNodeSdkOptions): SpanExporter {
  if (opts.spanExporter) return opts.spanExporter;

  const url = opts.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return new OTLPTraceExporter(url ? { url } : {});
}

function buildResource(opts: StartNodeSdkOptions) {
  const serviceName = opts.serviceName ?? DEFAULT_SERVICE_NAME;
  const deploymentEnvironment = process.env.NODE_ENV ?? 'development';

  return resourceFromAttributes({
    ...opts.resourceAttributes,
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: deploymentEnvironment,
  });
}

export function startNodeSdk(opts: StartNodeSdkOptions = {}): NodeSDK {
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    return noopSdk as NodeSDK;
  }

  if (startedSdk) return startedSdk;

  const delegateSpanProcessor = opts.spanExporter
    ? new SimpleSpanProcessor(buildTraceExporter(opts))
    : new BatchSpanProcessor(buildTraceExporter(opts), {
        exportTimeoutMillis: 3000,
        scheduledDelayMillis: 5000,
      });
  const spanProcessor = new RedactingSpanProcessor(delegateSpanProcessor);

  const sdk = new NodeSDK({
    resource: buildResource(opts),
    spanProcessors: [spanProcessor],
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: false,
      }),
    ],
  });

  try {
    sdk.start();
  } catch (error) {
    console.warn('OpenTelemetry SDK failed to start; continuing without tracing', error);
  }

  startedSdk = sdk;
  return sdk;
}

export async function resetNodeSdkForTests(): Promise<void> {
  const sdk = startedSdk;
  startedSdk = undefined;

  if (sdk) {
    await sdk.shutdown();
  }

  trace.disable();
  context.disable();
  propagation.disable();
  metrics.disable();
}
