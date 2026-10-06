// Import the compiled entry with ordinary Node ESM, as hosted functions do.
// No database request is issued and no developer credentials are loaded.
Object.assign(process.env, {
  VERCEL: '1', VERCEL_ENV: 'production',
  VERCEL_PROJECT_PRODUCTION_URL: 'hrbip-runtime-check.example',
  PUBLIC_DEMO: 'true', COOKIE_SECURE: 'true',
});
delete process.env.APP_ORIGIN;
delete process.env.DATABASE_URL;
delete process.env.PGPASSWORD;
const { default: app } = await import('../.data/runtime-check/api/index.js');
if (typeof app !== 'function') throw new Error('Server entry must export an Express handler.');
console.log('PASS: compiled hosted entry loads in native Node ESM without a database connection.');
