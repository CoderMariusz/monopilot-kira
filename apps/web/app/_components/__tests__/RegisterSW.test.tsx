import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';

import RegisterSW, { isScannerPath, looksLikeJavaScript } from '../RegisterSW';

describe('RegisterSW helpers', () => {
  it('isScannerPath matches locale-prefixed and bare scanner URLs', () => {
    expect(isScannerPath('/pl/scanner')).toBe(true);
    expect(isScannerPath('/pl/scanner/home')).toBe(true);
    expect(isScannerPath('/scanner')).toBe(true);
    expect(isScannerPath('/en/dashboard')).toBe(false);
    expect(isScannerPath('/pl/shipping')).toBe(false);
  });

  it('looksLikeJavaScript accepts JS MIME types only', () => {
    expect(looksLikeJavaScript('application/javascript')).toBe(true);
    expect(looksLikeJavaScript('text/javascript; charset=utf-8')).toBe(true);
    expect(looksLikeJavaScript('text/html')).toBe(false);
    expect(looksLikeJavaScript(null)).toBe(false);
  });
});

describe('RegisterSW component', () => {
  let registerSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registerSpy = vi.fn().mockResolvedValue({ installing: null });
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/javascript' },
    });
    vi.stubGlobal('fetch', fetchSpy);

    Object.defineProperty(window, 'location', {
      value: { pathname: '/pl/scanner/home' },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerSpy },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('registers /sw.js on scanner routes outside development', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    render(<RegisterSW />);
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/sw.js', expect.objectContaining({ method: 'GET' }));
      expect(registerSpy).toHaveBeenCalledWith('/sw.js');
    });
  });

  it('does NOT register off scanner routes', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    Object.defineProperty(window, 'location', {
      value: { pathname: '/pl/dashboard' },
      writable: true,
      configurable: true,
    });
    render(<RegisterSW />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('does NOT register in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<RegisterSW />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();
  });
});
