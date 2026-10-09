import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

// Vercel detecta este archivo como punto de entrada (soporte nativo de NestJS),
// lo compila y lo sirve como una función; la instancia se reutiliza entre invocaciones.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
