export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeSdk } = await import('@monopilot/observability/sdk-node');
    startNodeSdk({ serviceName: 'monopilot-web' });
  }
}
