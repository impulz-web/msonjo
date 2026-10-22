import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MSONJO GAS & HOUSE HOLD',
    short_name: 'MSONJO',
    description: 'MSONJO GAS & HOUSE HOLD inventory management.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#E31E24',
  };
}
