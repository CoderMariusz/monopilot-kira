import type { MetadataRoute } from 'next';

const manifest: MetadataRoute.Manifest = {
  name: 'Monopilot',
  short_name: 'Monopilot',
  start_url: '/',
  display: 'standalone',
  theme_color: '#ffffff',
  background_color: '#ffffff',
  categories: ['productivity', 'business'],
  icons: [
    {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png'
    },
    {
      src: '/icons/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png'
    },
    {
      src: '/icons/icon-512x512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ]
};

export default manifest;
