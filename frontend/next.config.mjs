import { fileURLToPath } from 'node:url';

const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

export default {
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
      ]
    }];
  }
};
