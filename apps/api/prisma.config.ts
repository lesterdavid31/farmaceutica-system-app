import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// La CLI de Prisma (migraciones) usa la conexión directa de Neon.
// En tiempo de ejecución la app usa DATABASE_URL (pooled) mediante el driver adapter.
// Se lee con process.env para que `prisma generate` funcione aunque no exista la variable
// (por ejemplo, durante la instalación en Vercel).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
