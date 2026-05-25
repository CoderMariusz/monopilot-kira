import { describe, it, expect } from 'vitest';

describe('manifest.ts', () => {
  it('should export manifest object with name field', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest).toBeDefined();
    expect(manifest).toHaveProperty('name');
  });

  it('should have name equal to "Monopilot"', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest.name).toBe('Monopilot');
  });

  it('should have short_name field', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest).toHaveProperty('short_name');
  });

  it('should have short_name equal to "Monopilot"', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest.short_name).toBe('Monopilot');
  });

  it('should have start_url field', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest).toHaveProperty('start_url');
  });

  it('should have start_url equal to "/"', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest.start_url).toBe('/');
  });

  it('should have display field set to "standalone"', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest.display).toBe('standalone');
  });

  it('should have theme_color field', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest).toHaveProperty('theme_color');
  });

  it('should have background_color field', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(manifest).toHaveProperty('background_color');
  });

  it('should have icons array with at least two sizes (192x192 and 512x512)', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('should have valid icon objects with src, sizes, and type properties', async () => {
    const mod = await import('../manifest.js');

    const getManifest = (mod as any).default as () => { name: string; short_name: string; start_url: string; display: string; theme_color: string; background_color: string; icons: Array<{ src?: string; sizes: string; type?: string; purpose?: string }> };
    const manifest = getManifest();
    manifest.icons.forEach((icon: { src?: string; sizes?: string; type?: string }) => {
      expect(icon).toHaveProperty('src');
      expect(icon).toHaveProperty('sizes');
      expect(icon).toHaveProperty('type');
    });
  });
});
