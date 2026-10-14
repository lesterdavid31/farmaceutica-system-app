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

| App      | Variable              | Descripción                                                                                     |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| backend  | `DATABASE_URL`        | Conexión _pooled_ de Neon (tiempo de ejecución)                                                 |
| backend  | `DIRECT_URL`          | Conexión directa de Neon (migraciones de Prisma)                                                |
| backend  | `CORS_ORIGINS`        | Opcional. Dominios extra permitidos por CORS. En desarrollo se agrega `localhost:5173`          |
| backend  | `PORT`                | Puerto local (3000 por defecto)                                                                 |
| backend  | `JWT_SECRET`          | Secreto para firmar los tokens (mínimo 32 caracteres aleatorios)                                |
| backend  | `JWT_EXPIRES_IN`      | Vigencia del token de acceso (`8h` por defecto)                                                 |
| backend  | `GOOGLE_MAPS_API_KEY` | Opcional. Key con Routes API para los tiempos de entrega; sin ella se usa el respaldo haversine |
| frontend | `VITE_API_URL`        | Opcional. Solo si la API está en otro dominio; por defecto se usa `/api/v1` del mismo dominio   |

## Scripts

| Comando                                 | Qué hace                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                          | ESLint en ambas apps                                                                                                                                    |
| `npm run typecheck`                     | Verificación de tipos de TypeScript                                                                                                                     |
| `npm test`                              | Pruebas unitarias (Jest) de la API                                                                                                                      |
| `npm run test:e2e -w @farmacia/backend` | Pruebas de punta a punta contra la base de datos con el seed (permisos, inventario, traslados, caja, ventas, call center, planilla, activos y reportes) |
| `npm run seed -w @farmacia/backend`     | Carga o actualiza los datos de demostración                                                                                                             |
| `npm run build`                         | Build de producción de ambas apps                                                                                                                       |
| `npm run format`                        | Formatea con Prettier                                                                                                                                   |

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

## Datos de demostración

`npm run seed -w @farmacia/backend` carga una cadena con unos **3 meses de operación** (sección 9 de la especificación). Es idempotente: cada parte se omite si ya existe. Sobre una base vacía tarda unos 9 minutos contra Neon: la historia se guarda en poco más de un minuto, y el resto son las partes que usan los servicios de la API una operación a la vez.

| Parte                              | Contenido                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo                           | 22 departamentos, 9 ubicaciones con coordenadas reales, 20 usuarios, 45 productos genéricos, 4 proveedores y los parámetros de configuración                                                                                                                                                                                                                                     |
| Inventario inicial (hace ~4 meses) | 3 compras de la bodega con lotes que hoy están vencidos, por vencer y con vencimiento lejano; inventario de apertura de cada sucursal (a cada una le faltan algunos productos, y 3 solo existen en la bodega y en Xela) y stock mínimo                                                                                                                                           |
| Historia (hace 92 días a ayer)     | Compras quincenales de la bodega, traslados quincenales a cada sucursal (algunos con faltantes y algunos cancelados), un turno de caja diario por sucursal con unas 10,000 ventas, gastos, retiros, depósitos, anulaciones y arqueos (uno de cada diez con diferencia), unos 340 pedidos del call center (algunos entregados tarde y otros cancelados) y bajas de lotes vencidos |
| Hoy                                | Un traslado en cada estado, turnos abiertos y cerrados, y pedidos pendientes, atrasados, en preparación y esperando un traslado (detalle en cada sección)                                                                                                                                                                                                                        |
| Planilla y activos                 | 34 empleados, planillas cerradas de agosto y septiembre de 2026 y 30 activos fijos                                                                                                                                                                                                                                                                                               |

La historia se simula en memoria con las mismas reglas y funciones de la API (FEFO sin vencidos, arqueo, ciclo de traslados y de pedidos) y se guarda en bloque en una sola transacción; usar los servicios uno por uno para miles de ventas haría decenas de miles de viajes a la base. Las fechas son relativas al día en que se ejecuta el seed. Después de cargarla se verificó que el saldo del kardex nunca queda negativo, que cada existencia es igual a la suma de sus movimientos y que cada arqueo cuadra con los movimientos del turno.

### Recorrido sugerido

1. **`admin`**: dashboard ejecutivo con las alertas del día; filtrar por una ubicación con el selector.
2. **`auditor`**: _Auditoría → Flujo de efectivo_ desde el 01/07 (sobrantes y faltantes por sucursal) y exportar a CSV; _Movimiento de medicamentos_ y _Bitácora_.
3. **`cajero.xela`**: abrir caja, vender en el punto de venta (los lotes salen por FEFO) y cerrar con arqueo.
4. **`operador`**: nuevo pedido para un cliente (teléfono `55210004`) con _Claritromicina 500 mg_: solo hay en la bodega y en Xela, así que el sistema propone un traslado.
5. **`gerente.coban`**: dashboard de sucursal, el pedido atrasado en camino y la anulación de una venta del turno abierto.
6. **`gerente.bodega`**: aprobar y despachar el traslado solicitado; registrar una compra.

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
- El seed carga 3 compras iniciales de la bodega (con lotes vencidos, por vencer y de vencimiento lejano), el inventario de apertura de cada sucursal como ajuste con motivo y el stock mínimo de los productos de mayor rotación, y después 3 meses de compras, traslados, ventas y bajas (ver _Datos de demostración_). Cada sucursal carece de algunos productos para demostrar la sugerencia de traslado del call center.
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

## Call center y entregas

- **Clientes:** se buscan por teléfono, nombre o NIT. Cada dirección guarda coordenadas, que el operador marca con un clic en un mapa de OpenStreetMap (Leaflet, sin API key) o escribe a mano.
- **Consultar disponibilidad:** devuelve las sucursales activas que tienen **todo** el pedido con lotes vigentes, ordenadas por tiempo estimado (ruta + preparación configurable) y con la mejor opción resaltada. Si ninguna lo tiene todo, propone la sucursal más cercana con los traslados que le faltan: primero un solo origen que cubra todo, si no, el origen más rápido por producto. Al tiempo se suma el viaje del traslado y la preparación en el origen.
- **Tiempos de ruta:** se calculan en el backend con Google Maps Routes API (Compute Route Matrix), filtrando antes las 10 sucursales más cercanas en línea recta. Sin `GOOGLE_MAPS_API_KEY`, o si la API falla o excede la cuota, se usa haversine × 1.3 a la velocidad promedio configurable. La pantalla avisa cuando los tiempos son estimados.
- **Crear pedido:** el servidor vuelve a calcular el plan de la sucursal elegida; si le falta producto, crea los traslados `PEDIDO_CLIENTE` en la misma transacción. La fecha de compromiso no puede ser anterior al tiempo estimado; por defecto es ahora + tiempo estimado, redondeada a 5 minutos.
- **Estados:** `PENDIENTE → EN_PREPARACION → ASIGNADO → EN_CAMINO → ENTREGADO`. Al preparar se descuenta el inventario por FEFO y se genera la venta `CALL_CENTER`; si el pedido espera un traslado, primero hay que recibirlo. El gerente o el cajero de la sucursal asigna repartidor (empleados sin acceso al sistema) y avanza los estados. Cada cambio queda en el historial inmutable.
- **Cobro (decisión del equipo):** contra entrega (efectivo) o tarjeta con datáfono, ambos al entregar. Entra a la caja del cajero que confirma; si confirma el gerente, al turno abierto más antiguo de la sucursal. Sin caja abierta no se confirma la entrega. Contra entrega cuenta como efectivo en el arqueo.
- **Cancelación (decisión del equipo):** el operador, el gerente de la sucursal o el administrador, hasta `EN_CAMINO`. Si ya se descontó inventario, la venta se anula y los lotes regresan. Los traslados del pedido que no han salido se cancelan; los que están en tránsito llegan como reabastecimiento.
- **Atrasos:** un pedido sin entregar después de su fecha de compromiso aparece como atrasado. Se calcula al consultar, sin tareas programadas.
- **Seed:** 2 repartidores por sucursal, 8 clientes y 7 pedidos:
  - Cobán: uno entregado y cobrado en la caja abierta, y otro en camino y atrasado.
  - Xela: dos pendientes, uno de ellos atrasado.
  - Escuintla: uno en preparación.
  - Huehuetenango: uno que espera un traslado de MED-0014.
  - Zacapa: uno cancelado.

## Planilla

- **Empleados:** el gerente gestiona los de su sucursal y el administrador, los de todas; solo el administrador los cambia de ubicación. Se desactivan, no se borran. Pueden vincularse a su usuario del sistema; los repartidores no tienen usuario.
- **Generar:** una planilla mensual por ubicación con los empleados activos que ingresaron antes de terminar el mes. La bonificación incentivo y el porcentaje de IGSS salen de la configuración (Q250 y 4.83 % por defecto). No se generan meses futuros.
- **Cálculo (RN-22):**
  - IGSS = salario base × porcentaje, redondeado al centavo. La bonificación no cotiza.
  - Líquido = salario + bonificación − IGSS − otros descuentos.
  - La base de datos verifica con un CHECK que el líquido cuadre y no sea negativo.
- **Borrador y cierre (RN-23):**
  - En borrador se editan la bonificación y los otros descuentos de cada línea, y el total se recalcula.
  - Un borrador se puede eliminar para volver a generarlo.
  - Una planilla cerrada no se modifica ni se borra: lo impide el servicio y además un trigger en la base de datos.
- **Reporte:** gasto por mes y por ubicación con el consolidado. Solo cuentan las planillas cerradas; los borradores se muestran aparte.

## Activos fijos

- **Depreciación lineal (RN-24):** mensual = (costo − valor residual) / vida útil en meses.
  - Se cuentan los **meses completos** desde la adquisición: un mes se completa el mismo día del mes siguiente, o el último día si ese día no existe.
  - La acumulada es (costo − residual) × meses / vida útil, redondeada al centavo. Al terminar la vida útil, el valor en libros queda exactamente en el residual.
- **Categorías (RN-25):** la vida útil por defecto se puede editar y se usa al registrar un activo sin vida útil propia. Cambiarla no altera los activos ya registrados.
- **Traslados (RN-26):** la ubicación de un activo solo cambia con un traslado con motivo, que queda en un historial inmutable. Los activos dados de baja no se trasladan.
- **Reporte:** valor en libros a cualquier fecha, por ubicación y por categoría, con la depreciación acumulada. Cada activo aparece en la ubicación que tenía en esa fecha según su historial. Se excluyen los adquiridos después de la fecha y los dados de baja.
- **Permisos:** solo el administrador registra, edita, traslada y da de baja; el auditor consulta todo y el gerente, los de su sucursal.
- **Seed:** el gerente y el cajero de cada sucursal como empleados, un bodeguero, planillas cerradas de agosto y septiembre de 2026 en las 9 ubicaciones, 30 activos y un traslado de un equipo de cómputo de la bodega a Zacapa.

## Dashboards y auditoría

- **Dashboard ejecutivo** (ADMIN y AUDITOR, filtrable con el selector de ubicación) y **de sucursal** (GERENTE, su ubicación):
  - primero "Requiere atención hoy": pedidos atrasados, lotes vencidos y por vencer, stock bajo y cajas con diferencia en los últimos 7 días, con enlaces;
  - luego los indicadores: ventas del día, mes y año, inventario a costo, valor de los activos y gasto en planilla del mes (o del último mes cerrado);
  - al final, las gráficas de ventas por día (30 días) e ingresos del mes por sucursal y método de pago.
  - El cajero y el operador entran a la lista de sus módulos.
- **Flujo de efectivo:** consolidado y por sucursal en un rango de fechas.
  - Ingresos netos por método (ventas y cobros de pedidos menos anulaciones), depósitos, gastos, retiros y neto en efectivo.
  - Sobrantes y faltantes de los turnos cerrados en el período, y el detalle de los turnos.
- **Movimiento de medicamentos:** kardex global de todos los productos, con resumen por tipo de movimiento, y traslados por ruta (origen → destino) con estados, unidades, faltantes de recepción y valor enviado.
- **Bitácora:** consultable por usuario, entidad, acción y fechas.
- **Exportar CSV:** en el dashboard, el flujo de efectivo, el movimiento de medicamentos, el kardex, las alertas, los turnos, las ventas, la bitácora y los reportes de planilla y activos.
  - Los listados paginados se exportan completos, hasta 5,000 filas.
  - El archivo lleva BOM UTF-8 (para que Excel muestre las tildes) y montos sin formato.
- **Cálculos:** todas las sumas se hacen en SQL y los días se cortan con la hora de Guatemala (UTC−6). Las pruebas e2e recalculan cada indicador por otro camino y verifican que coincida con los datos del seed.
- **Gráficas:** usan Recharts con la paleta de la sección 8.1.
  - Validada con el script de la guía de visualización: separación para daltonismo ΔE 21.8.
  - Las series 2 y 4 tienen contraste bajo contra el fondo, así que cada gráfica lleva leyenda, etiquetas de total y una vista de tabla.
  - Las barras no se animan.

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
- **Decisiones del call center** (definidas por el equipo): los pedidos se cobran al entregar y el cobro entra a una caja abierta de la sucursal; se cancelan hasta `EN_CAMINO`; las coordenadas se marcan en un mapa de OpenStreetMap.
- **Decisiones de caja** (la especificación no las fijaba; las definió el equipo): un depósito es efectivo que entra a la gaveta; una venta solo se anula mientras su turno sigue abierto; solo el cajero abre caja y vende.
- **Entrypoint del backend** `apps/backend/server.js`, que carga la salida de `tsc` en lugar de un handler manual en `api/`: el compilador de Vercel no emite los metadatos de decoradores que NestJS necesita (detalles en `docs/despliegue.md`).
