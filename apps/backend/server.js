// Punto de entrada para Vercel. Carga la API ya compilada por `nest build` (tsc).
// No se usa src/servidor.ts directamente porque el transpilador de Vercel no emite los
// metadatos de decoradores (emitDecoratorMetadata) que NestJS necesita para inyectar
// dependencias. Por eso el entrypoint de NestJS no se llama src/main.ts.
require('./dist/servidor');
