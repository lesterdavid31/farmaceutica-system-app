import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

// Arranque de la API. En Vercel se carga a través de ../server.js ya compilado por tsc;
// la instancia se reutiliza entre invocaciones de la función.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
