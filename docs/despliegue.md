# Manual de despliegue

El sistema se despliega como **un solo proyecto de Vercel con Services** (beta), conectado al repositorio de GitHub, más una base de datos PostgreSQL en **Neon**. Frontend y backend se construyen por separado pero se publican juntos en el mismo dominio:

| Ruta pública  | Servicio   | Carpeta         | Framework |
| ------------- | ---------- | --------------- | --------- |
| `/api/*`      | `backend`  | `apps/backend`  | NestJS    |
| todo lo demás | `frontend` | `apps/frontend` | Vite      |

La configuración está en [`vercel.json`](../vercel.json) en la raíz del repositorio (documentación: <https://vercel.com/docs/services>).

Ventajas frente a dos proyectos separados: un solo dominio (el frontend llama a `/api/v1` sin CORS ni `VITE_API_URL`), variables de entorno compartidas y despliegues sincronizados de ambos servicios en producción y en vistas previas.

## 1. Base de datos en Neon

1. Crear un proyecto en [neon.tech](https://neon.tech).
2. En **Connect**, copiar dos cadenas de conexión:
   - **Pooled** (el host contiene `-pooler`): será `DATABASE_URL`. La usa la aplicación en tiempo de ejecución.
   - **Directa** (la misma sin `-pooler`): será `DIRECT_URL`. La usa la CLI de Prisma para las migraciones.

## 2. Proyecto en Vercel

1. **Add New → Project** e importar el repositorio de GitHub.
2. Dejar el **Root Directory en la raíz** del repositorio: Vercel lee `vercel.json` y detecta los dos servicios.
3. **Environment Variables** (Production y Preview):

   | Variable       | Valor                                                                   |
   | -------------- | ----------------------------------------------------------------------- |
   | `DATABASE_URL` | Cadena _pooled_ de Neon                                                 |
   | `DIRECT_URL`   | Cadena directa de Neon                                                  |
   | `JWT_SECRET`   | Secreto aleatorio de al menos 32 caracteres, distinto del de desarrollo |

   Generar el secreto con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Si cambia, todas las sesiones abiertas se cierran.

   No hacen falta `VITE_API_URL` ni `CORS_ORIGINS`: frontend y backend comparten dominio.

4. **Deploy.** Verificar:
   - `https://<proyecto>.vercel.app/`: pantalla _Estado del sistema_ con la API _En línea_ y la base de datos _Conectada_.
   - `https://<proyecto>.vercel.app/api/v1/health`: respuesta JSON del backend.
   - `https://<proyecto>.vercel.app/api/docs`: documentación Swagger.

### Variables con la CLI de Vercel (alternativa al panel)

```bash
npx vercel login
npx vercel link                      # vincula la carpeta con el proyecto
npx vercel env add DATABASE_URL production,preview --sensitive --value "<pooled>"
npx vercel env add DIRECT_URL production,preview --sensitive --value "<directa>"
npx vercel env add JWT_SECRET production,preview --sensitive --value "<secreto>"
npx vercel deploy --prod             # o un push a main
```

## Cómo se ejecuta NestJS en Vercel

El servicio `backend` usa como entrypoint `apps/backend/server.js`, que solo carga `dist/servidor.js`, la salida de `nest build` (compilada con `tsc`).

**Por qué no se usa `src/main.ts` directamente:** el builder de NestJS de Vercel transpila TypeScript con su propio compilador, que **no emite los metadatos de decoradores** (`emitDecoratorMetadata`). Sin ellos, la inyección de dependencias de NestJS falla en tiempo de ejecución: los controladores reciben `undefined` en lugar de sus servicios. Por eso el archivo de arranque se llama `src/servidor.ts` (Vercel no lo detecta) y Vercel empaqueta el JavaScript ya compilado.

**Regla para el código del backend:** en los DTOs, declarar siempre el tipo en `@ApiProperty({ type: ... })` cuando la propiedad sea un tipo literal o una unión, porque Swagger no puede inferirlo de forma confiable.

El cliente de Prisma se genera en `postinstall` (`prisma generate`) y en el script `build`. La instancia de NestJS se reutiliza entre invocaciones gracias a _Fluid compute_.

## Desarrollo local

Opción habitual, cada app por separado (Vite redirige `/api` a `localhost:3000`):

```bash
npm run dev:backend
npm run dev:frontend
```

Opción que replica el ruteo de producción con los dos servicios en `http://localhost:3000`:

```bash
npx vercel dev -L
```

## Migraciones de base de datos

**Decisión:** las migraciones se ejecutan **manualmente** desde una máquina de desarrollo, no en el build de Vercel. Así los _preview deployments_ de cada rama no modifican la base de datos de producción y se controla el momento exacto de cada migración.

```bash
# con DIRECT_URL de producción en apps/backend/.env
npm run prisma:deploy -w @farmacia/backend
npm run seed -w @farmacia/backend   # idempotente: crea o actualiza los datos de demostración
```

La migración inicial agrega, además de las tablas, el `CHECK` de existencias no negativas y los triggers que hacen inmutables el kardex, los movimientos de caja, la bitácora y los historiales.

Para desarrollo local se usa `npm run prisma:migrate -w @farmacia/backend`, que crea nuevas migraciones.

## Limitaciones aceptadas

- Vercel Services está en beta.
- Arranque en frío de la función de Vercel y suspensión de Neon por inactividad: la primera petición después de un rato sin uso puede tardar unos segundos.
- Sin tareas en segundo plano ni WebSockets. Los indicadores (por ejemplo, pedidos atrasados) se calculan al consultar.
