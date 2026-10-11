# Sistema de gestión para cadena de farmacias

Prototipo del sistema integral de una cadena de farmacias con sucursales en centros comerciales y stands en gasolineras: inventario por lote, traslados, ventas y caja, call center con entregas, planilla, activos fijos y auditoría. La especificación completa está en [`ESPECIFICACION.md`](./ESPECIFICACION.md).

Proyecto de examen privado del Área de Análisis y Desarrollo, Facultad de Ingeniería en Sistemas, Universidad Mariano Gálvez de Guatemala.

## Estructura

```
apps/
  backend/   NestJS 11 + Prisma 7 (PostgreSQL en Neon)
  frontend/  React 19 + Vite 8 + Tailwind CSS 4 + TanStack Query
docs/    Diagrama E-R, documentos RUP y manual de despliegue
```

Monorepo con npm workspaces.

## Requisitos

- Node.js 24 LTS y npm 11
- Una base de datos PostgreSQL (Neon en producción). Sin `DATABASE_URL` la API arranca igual y `/api/v1/health` reporta la base de datos como _sin configurar_.

## Instalación local

```bash
npm install
cp apps/backend/.env.example apps/backend/.env   # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
cp apps/frontend/.env.example apps/frontend/.env

npm run prisma:deploy -w @farmacia/backend   # aplica las migraciones
npm run seed -w @farmacia/backend            # carga los datos de demostración (idempotente)

npm run dev:backend    # http://localhost:3000/api/v1  · Swagger en /api/docs
npm run dev:frontend   # http://localhost:5173
```

> npm 11 solo ejecuta los scripts de instalación aprobados en `allowScripts` (`package.json`). Prisma ya está aprobado; si `npm install` avisa de un paquete nuevo, revísalo con `npm install-scripts ls`.

## Variables de entorno

| App      | Variable         | Descripción                                                                                   |
| -------- | ---------------- | --------------------------------------------------------------------------------------------- |
| backend  | `DATABASE_URL`   | Conexión _pooled_ de Neon (tiempo de ejecución)                                               |
| backend  | `DIRECT_URL`     | Conexión directa de Neon (migraciones de Prisma)                                              |
| backend  | `CORS_ORIGINS`   | Opcional. Dominios extra permitidos por CORS. En desarrollo se agrega `localhost:5173`        |
| backend  | `PORT`           | Puerto local (3000 por defecto)                                                               |
| backend  | `JWT_SECRET`     | Secreto para firmar los tokens (mínimo 32 caracteres aleatorios)                              |
| backend  | `JWT_EXPIRES_IN` | Vigencia del token de acceso (`8h` por defecto)                                               |
| frontend | `VITE_API_URL`   | Opcional. Solo si la API está en otro dominio; por defecto se usa `/api/v1` del mismo dominio |

## Scripts

| Comando                                 | Qué hace                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                          | ESLint en ambas apps                                                                                          |
| `npm run typecheck`                     | Verificación de tipos de TypeScript                                                                           |
| `npm test`                              | Pruebas unitarias (Jest) de la API                                                                            |
| `npm run test:e2e -w @farmacia/backend` | Pruebas de punta a punta contra la base de datos con el seed (permisos, inventario, traslados, caja y ventas) |
| `npm run seed -w @farmacia/backend`     | Carga o actualiza los datos de demostración                                                                   |
| `npm run build`                         | Build de producción de ambas apps                                                                             |
| `npm run format`                        | Formatea con Prettier                                                                                         |

## Usuarios de prueba

Todos usan la contraseña **`Farmacia2026!`**.

| Correo                          | Rol                     | Ubicación                       |
| ------------------------------- | ----------------------- | ------------------------------- |
| `admin@farmacia.gt`             | Administrador           | Todas                           |
| `auditor@farmacia.gt`           | Auditor (solo lectura)  | Todas                           |
| `operador@farmacia.gt`          | Operador de call center | Todas (solo lectura de stock)   |
| `gerente.bodega@farmacia.gt`    | Gerente                 | Bodega Central                  |
| `gerente.xela@farmacia.gt`      | Gerente                 | Farmacia Interplaza Xela        |
| `cajero.xela@farmacia.gt`       | Cajero                  | Farmacia Interplaza Xela        |
| `gerente.escuintla@farmacia.gt` | Gerente                 | Farmacia Plaza Palmeras         |
| `cajero.escuintla@farmacia.gt`  | Cajero                  | Farmacia Plaza Palmeras         |
| `gerente.huehue@farmacia.gt`    | Gerente                 | Farmacia Pradera Huehuetenango  |
| `cajero.huehue@farmacia.gt`     | Cajero                  | Farmacia Pradera Huehuetenango  |
| `gerente.coban@farmacia.gt`     | Gerente                 | Farmacia Plaza Magdalena        |
| `cajero.coban@farmacia.gt`      | Cajero                  | Farmacia Plaza Magdalena        |
| `gerente.peten@farmacia.gt`     | Gerente                 | Farmacia Metro Plaza Mundo Maya |
| `cajero.peten@farmacia.gt`      | Cajero                  | Farmacia Metro Plaza Mundo Maya |
| `gerente.chimal@farmacia.gt`    | Gerente                 | Stand Gasolinera Chimaltenango  |
| `cajero.chimal@farmacia.gt`     | Cajero                  | Stand Gasolinera Chimaltenango  |
| `gerente.zacapa@farmacia.gt`    | Gerente                 | Stand Gasolinera Zacapa         |
| `cajero.zacapa@farmacia.gt`     | Cajero                  | Stand Gasolinera Zacapa         |
| `gerente.reu@farmacia.gt`       | Gerente                 | Stand Gasolinera Retalhuleu     |
| `cajero.reu@farmacia.gt`        | Cajero                  | Stand Gasolinera Retalhuleu     |

## Seguridad y auditoría

- Los permisos se aplican en el backend con guards globales: JWT → rol → solo lectura del auditor. GERENTE y CAJERO quedan limitados a su ubicación. El frontend solo oculta opciones.
- Cada petición vuelve a consultar al usuario: si se desactiva o cambia de rol, aplica de inmediato aunque su token siga vigente.
- Login limitado a 5 intentos por minuto por IP (en memoria de cada instancia).
- Toda escritura exitosa queda en la bitácora con usuario, acción, entidad, datos antes y después, fecha e IP; también los inicios de sesión y los intentos fallidos. Nunca se guardan contraseñas.
- La base de datos impide editar o borrar el kardex, los movimientos de caja, la bitácora y los historiales (triggers), y que una existencia quede negativa (CHECK).
- Usuarios, ubicaciones, productos, categorías y proveedores no se borran: se desactivan, para conservar su historial.
- Los montos `DECIMAL` llegan desde la API como texto (por ejemplo `"25.5"`) para no perder precisión.

## Inventario

- La existencia se controla por ubicación y lote. Toda salida de ventas y traslados se asigna por **FEFO**: el sistema elige los lotes, empezando por el que vence primero, y nunca usa lotes vencidos. Un lote se puede usar hasta su fecha de vencimiento inclusive (fecha de Guatemala).
- Las salidas bloquean las filas de existencia (`SELECT ... FOR UPDATE`) y restan con una actualización condicional (`cantidad >= x`) dentro de una transacción, para que dos operaciones simultáneas no vendan el mismo stock.
- Las correcciones se hacen con ajustes con motivo; los lotes vencidos se retiran con una baja por vencimiento. Ambos quedan en el kardex.
- Solo la bodega central registra compras a proveedores; las sucursales se abastecen con traslados.
- El seed carga 3 compras de la bodega (con lotes vencidos, por vencer y de vencimiento lejano), el inventario inicial de apertura de cada sucursal como ajuste con motivo y el stock mínimo de los productos de mayor rotación. Cada sucursal carece de algunos productos para demostrar la sugerencia de traslado del call center. La primera carga tarda unos 3 minutos.
- Las pruebas e2e de inventario corren dentro de transacciones que se revierten, porque el kardex es inmutable: no dejan datos en la base.

## Traslados

- Ciclo de vida: `SOLICITADO → APROBADO → EN_TRANSITO → RECIBIDO`, o `CANCELADO` antes de despachar. Cada cambio guarda quién lo hizo y cuándo; el detalle muestra ese historial.
- **Solicita** el administrador o un gerente, si el traslado sale de su ubicación o llega a ella. **Aprueba y despacha** el gerente de origen (o el administrador); **recibe** el gerente de destino; **cancela** cualquiera de los dos gerentes. La bodega central no recibe traslados.
- Al **despachar** se descuenta del origen por FEFO, sin lotes vencidos, con un movimiento `TRASLADO_SALIDA` por lote; un producto puede repartirse en varios lotes. Si falta existencia vigente, no se despacha nada y se informan todos los faltantes.
- Al **recibir** se ingresan en el destino los mismos lotes como `TRASLADO_ENTRADA`. Si llegó menos, el faltante se registra después como `AJUSTE` con el motivo, así el kardex muestra lo enviado y la diferencia por separado. No se acepta recibir más de lo despachado.
- Desde **Alertas → Bajo stock mínimo** se puede iniciar la solicitud con el producto y la cantidad sugerida.
- El seed crea un traslado en cada estado (uno recibido con una diferencia). Las pruebas e2e del ciclo completo corren en transacciones revertidas; como las secuencias de PostgreSQL no se revierten, cada corrida consume números de traslado.

## Caja y ventas

- **Turnos de caja:** solo el cajero abre caja, con el efectivo inicial de la gaveta. Tiene a lo sumo un turno abierto (índice único en la base) y sin turno abierto no puede vender. La bodega central no tiene caja.
- **Movimientos manuales:** gastos menores y retiros sacan efectivo; los depósitos lo agregan (por ejemplo, sencillo para cambio). No se puede sacar más efectivo del que hay en la gaveta.
- **Arqueo:** efectivo esperado = monto inicial + ventas en efectivo + depósitos − gastos − retiros − anulaciones en efectivo. Los pagos con tarjeta se informan pero no entran al arqueo. Al cerrar se guarda la diferencia con lo contado: positiva es sobrante y negativa, faltante.
- **Punto de venta:** se busca por nombre, SKU o principio activo. Los lotes se asignan por FEFO sin vencidos y la venta guarda una línea por lote. Se cobra en efectivo, con tarjeta o con ambos; los pagos deben sumar exactamente el total, y la pantalla calcula el cambio. El NIT es opcional (`CF` por defecto). Los productos con receta muestran un aviso, pero no se bloquean.
- **Anulación:** solo el gerente de la sucursal, con motivo y mientras el turno de la venta siga abierto. Devuelve cada lote con `ANULACION_VENTA` y registra la devolución en la caja como `ANULACION`, por método de pago. No se borra nada.
- **Comprobante:** el comprobante interno imprimible está en `/ventas/:id/comprobante`; no es una factura FEL.
- Cada operación de caja bloquea la fila del turno (`SELECT ... FOR UPDATE`), así que una venta y el cierre del mismo turno no se cruzan.
- **Seed:** Escuintla tiene un turno cerrado con un faltante de Q15.50; Huehuetenango, uno cuadrado con una venta anulada; y Cobán, uno abierto con ventas. Xela no tiene turno, para probar la apertura.

## Despliegue

Producción: <https://farmaceutica-system-app.vercel.app> (API en `/api/v1`, Swagger en `/api/docs`). Proyecto de Vercel `farmaceutica-system-app` conectado a GitHub: cada push a `main` despliega a producción.

Ver [`docs/despliegue.md`](./docs/despliegue.md).

## Versiones y desviaciones de la especificación

Versiones estables fijadas al iniciar el proyecto (9 de octubre de 2026):

- **React 19.3** en lugar de React 18: la especificación pide las versiones estables actuales y React Router 8 requiere React 19. Aprobado por el equipo.
- **NestJS 11.2** en lugar de 12: NestJS 12 solo se distribuye como ES Modules, lo que complica Jest (exigido por la especificación) y el despliegue serverless. La línea 11 sigue con mantenimiento activo.
- **TypeScript 6.0**: TypeScript 7 aún no es compatible con typescript-eslint ni con ts-jest.
- **Prisma 7.10**: la etiqueta `latest` de npm apunta a una versión candidata de Prisma 8; se usa la última estable.
- **Un solo proyecto de Vercel con Services** en lugar de dos proyectos separados: frontend y backend comparten dominio. Decisión del equipo.
- **Decisiones de caja** (la especificación no las fijaba; las definió el equipo): un depósito es efectivo que entra a la gaveta; una venta solo se anula mientras su turno sigue abierto; solo el cajero abre caja y vende.
- **Entrypoint del backend** `apps/backend/server.js`, que carga la salida de `tsc` en lugar de un handler manual en `api/`: el compilador de Vercel no emite los metadatos de decoradores que NestJS necesita (detalles en `docs/despliegue.md`).
