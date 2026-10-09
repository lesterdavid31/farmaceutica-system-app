# Manual de despliegue

El sistema se despliega como **dos proyectos de Vercel** conectados al mismo repositorio de GitHub, más una base de datos PostgreSQL en **Neon**.

| Componente              | Servicio | Root directory  | URL de ejemplo                     |
| ----------------------- | -------- | --------------- | ---------------------------------- |
| Backend (NestJS)        | Vercel   | `apps/backend`  | `https://farmacias-api.vercel.app` |
| Frontend (React + Vite) | Vercel   | `apps/frontend` | `https://farmacias-web.vercel.app` |
| Base de datos           | Neon     | —               | —                                  |

## 1. Subir el repositorio a GitHub

1. Crear un repositorio vacío en GitHub (sin README ni `.gitignore`).
2. Desde la raíz del proyecto:

   ```bash
   git remote add origin https://github.com/<usuario>/<repositorio>.git
   git push -u origin main
   ```

## 2. Base de datos en Neon

1. Crear un proyecto en [neon.tech](https://neon.tech) (región sugerida: `AWS us-east-1`, la misma región que las funciones de Vercel por defecto).
2. En **Connect**, copiar dos cadenas de conexión:
   - **Pooled** (el host contiene `-pooler`): será `DATABASE_URL`. La usa la aplicación en tiempo de ejecución.
   - **Directa** (desactivar _Connection pooling_): será `DIRECT_URL`. La usa la CLI de Prisma para las migraciones.

## 3. Proyecto del backend en Vercel

1. En Vercel: **Add New → Project** e importar el repositorio.
2. **Root Directory:** `apps/backend`. Vercel detecta el preset **NestJS** automáticamente; no cambiar los comandos de build ni el directorio de salida.
3. Dejar activada la opción _Include files outside the root directory in the Build Step_ (necesaria para los npm workspaces).
4. **Environment Variables:**

   | Variable       | Valor                                                                                                                   |
   | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL` | Cadena _pooled_ de Neon                                                                                                 |
   | `DIRECT_URL`   | Cadena directa de Neon                                                                                                  |
   | `CORS_ORIGINS` | URL del frontend, por ejemplo `https://farmacias-web.vercel.app` (varias separadas por coma). Se completa en el paso 5. |

5. **Deploy.** Al terminar, verificar `https://<backend>/api/v1/health` y la documentación en `https://<backend>/api/docs`.

### Cómo se ejecuta NestJS en Vercel

Se usa el **soporte nativo de NestJS** de Vercel (documentación vigente: <https://vercel.com/docs/frameworks/backend/nestjs>). Vercel detecta `src/main.ts`, lo compila y lo sirve como una sola función con _Fluid compute_, que reutiliza la instancia de la aplicación entre invocaciones. Por eso no hace falta un handler manual en `api/` ni un `vercel.json` con rewrites: cumplen el mismo objetivo que describía la especificación (inicializar una vez y reutilizar), con la configuración que Vercel recomienda hoy.

El cliente de Prisma se genera en `postinstall` (`prisma generate`) y en el script `build`.

## 4. Proyecto del frontend en Vercel

1. **Add New → Project**, importar el **mismo** repositorio otra vez.
2. **Root Directory:** `apps/frontend`. Preset: **Vite**.
3. **Environment Variables:** `VITE_API_URL` = URL del backend **sin** `/api/v1` ni barra final, por ejemplo `https://farmacias-api.vercel.app`.
4. **Deploy.** `apps/frontend/vercel.json` reescribe todas las rutas a `index.html` (SPA).

## 5. Cerrar el círculo (CORS)

1. Copiar la URL de producción del frontend.
2. En el proyecto del backend: **Settings → Environment Variables → `CORS_ORIGINS`** con esa URL.
3. **Deployments → Redeploy** del backend.
4. Abrir el frontend: la pantalla _Estado del sistema_ debe mostrar la API _En línea_ y la base de datos _Conectada_.

> Las variables `VITE_*` se incrustan durante el build: si cambia `VITE_API_URL`, hay que volver a desplegar el frontend.

## 6. Migraciones de base de datos

**Decisión:** las migraciones se ejecutan **manualmente** desde una máquina de desarrollo, no en el build de Vercel. Así los _preview deployments_ de cada rama no modifican la base de datos de producción y se controla el momento exacto de cada migración.

```bash
# con DIRECT_URL de producción en apps/backend/.env
npm run prisma:deploy -w @farmacia/backend
```

Para desarrollo local se usa `npm run prisma:migrate -w @farmacia/backend`, que crea nuevas migraciones.

## Limitaciones aceptadas

- Arranque en frío de la función de Vercel y suspensión de Neon por inactividad: la primera petición después de un rato sin uso puede tardar unos segundos.
- Sin tareas en segundo plano ni WebSockets. Los indicadores (por ejemplo, pedidos atrasados) se calculan al consultar.
