# Sistema de gestión para cadena de farmacias

Prototipo del sistema integral de una cadena de farmacias con sucursales en centros comerciales y stands en gasolineras: inventario por lote, traslados, ventas y caja, call center con entregas, planilla, activos fijos y auditoría. La especificación completa está en [`ESPECIFICACION.md`](./ESPECIFICACION.md).

Proyecto de examen privado del Área de Análisis y Desarrollo, Facultad de Ingeniería en Sistemas, Universidad Mariano Gálvez de Guatemala.

## Estructura

```
apps/
  api/   NestJS 11 + Prisma 7 (PostgreSQL en Neon)
  web/   React 19 + Vite 8 + Tailwind CSS 4 + TanStack Query
docs/    Diagrama E-R, documentos RUP y manual de despliegue
```

Monorepo con npm workspaces.

## Requisitos

- Node.js 24 LTS y npm 11
- Una base de datos PostgreSQL (Neon en producción). Sin `DATABASE_URL` la API arranca igual y `/api/v1/health` reporta la base de datos como _sin configurar_.

## Instalación local

```bash
npm install
cp apps/api/.env.example apps/api/.env   # completar DATABASE_URL y DIRECT_URL
cp apps/web/.env.example apps/web/.env

npm run dev:api   # http://localhost:3000/api/v1  · Swagger en /api/docs
npm run dev:web   # http://localhost:5173
```

> npm 11 solo ejecuta los scripts de instalación aprobados en `allowScripts` (`package.json`). Prisma ya está aprobado; si `npm install` avisa de un paquete nuevo, revísalo con `npm install-scripts ls`.

## Variables de entorno

| App | Variable       | Descripción                                                                                    |
| --- | -------------- | ---------------------------------------------------------------------------------------------- |
| api | `DATABASE_URL` | Conexión _pooled_ de Neon (tiempo de ejecución)                                                |
| api | `DIRECT_URL`   | Conexión directa de Neon (migraciones de Prisma)                                               |
| api | `CORS_ORIGINS` | Dominios del frontend permitidos, separados por coma. En desarrollo se agrega `localhost:5173` |
| api | `PORT`         | Puerto local (3000 por defecto)                                                                |
| web | `VITE_API_URL` | URL del backend, sin `/api/v1`                                                                 |

## Scripts

| Comando             | Qué hace                            |
| ------------------- | ----------------------------------- |
| `npm run lint`      | ESLint en ambas apps                |
| `npm run typecheck` | Verificación de tipos de TypeScript |
| `npm test`          | Pruebas unitarias (Jest) de la API  |
| `npm run build`     | Build de producción de ambas apps   |
| `npm run format`    | Formatea con Prettier               |

## Usuarios de prueba

Se crearán con el seed en la fase 1.

## Despliegue

Ver [`docs/despliegue.md`](./docs/despliegue.md).

## Versiones y desviaciones de la especificación

Versiones estables fijadas al iniciar el proyecto (9 de octubre de 2026):

- **React 19.3** en lugar de React 18: la especificación pide las versiones estables actuales y React Router 8 requiere React 19. Aprobado por el equipo.
- **NestJS 11.2** en lugar de 12: NestJS 12 solo se distribuye como ES Modules, lo que complica Jest (exigido por la especificación) y el despliegue serverless. La línea 11 sigue con mantenimiento activo.
- **TypeScript 6.0**: TypeScript 7 aún no es compatible con typescript-eslint ni con ts-jest.
- **Prisma 7.10**: la etiqueta `latest` de npm apunta a una versión candidata de Prisma 8; se usa la última estable.
- **Despliegue de NestJS** con el soporte nativo de Vercel en lugar de un handler manual en `api/` (detalles en `docs/despliegue.md`).
