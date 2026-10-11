import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const PREFIJO_API = 'api/v1';

// Los recursos de Swagger UI se cargan desde CDN porque en Vercel los archivos estáticos
// de swagger-ui-dist no se incluyen en el bundle de la función.
const SWAGGER_UI_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.29.1';

export function origenesPermitidos(valor: string | undefined, entorno: string | undefined) {
  const origenes = (valor ?? '')
    .split(',')
    .map((origen) => origen.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (entorno !== 'production') {
    origenes.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return origenes;
}

export function configurarApp(app: INestApplication) {
  // Detrás del proxy de Vercel: req.ip toma la IP real del cliente (bitácora y límite de login).
  (app as NestExpressApplication).set('trust proxy', true);
  app.setGlobalPrefix(PREFIJO_API);
  app.enableCors({
    origin: origenesPermitidos(process.env.CORS_ORIGINS, process.env.NODE_ENV),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('API Sistema de Farmacias')
    .setDescription('API REST del sistema de gestión para la cadena de farmacias')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documento = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documento, {
    customSiteTitle: 'API Sistema de Farmacias',
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.min.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.min.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.min.js`,
    ],
  });
}
