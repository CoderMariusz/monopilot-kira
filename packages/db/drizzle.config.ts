import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable must be set for drizzle config');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './schema',
  out: './migrations',
  dbCredentials: {
    url: databaseUrl,
  },
});
