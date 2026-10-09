# Especificación del Sistema de Gestión para Cadena de Farmacias

> **Instrucciones para Claude Code:** este documento es la fuente de verdad del proyecto. Trabaja **por fases** (sección 12), en orden. Al terminar cada fase: corre lint y pruebas, verifica que todo compile, haz commit con un mensaje descriptivo y resume lo hecho antes de continuar. Si algo de este documento es ambiguo o contradictorio, pregunta antes de inventar. No implementes nada listado en "Fuera de alcance" (sección 14).

---

## 1. Contexto

Proyecto de examen privado del Área de Análisis y Desarrollo, Facultad de Ingeniería en Sistemas, Universidad Mariano Gálvez de Guatemala.

Una cadena de farmacias se expande al interior de Guatemala con dos formatos de sucursal: **farmacias en centros comerciales** y **stands dentro de tiendas de gasolineras**. Necesita un sistema integral que le permita controlar todas sus sucursales y auditar fácilmente sus operaciones: inventario, activos fijos, flujo de efectivo, movimiento de medicamentos entre sucursales, planilla y entregas a clientes. El sistema debe quedar preparado para integrarse en el futuro con un portal de clientes y un call center centralizado.

## 2. Prioridades y alcance

| Prioridad | Entregable | Nivel |
|---|---|---|
| 1 | Prototipo funcional desplegado | Completo y funcional |
| 2 | Diagrama Entidad-Relación | Generado a partir del esquema real |
| 3 | Documentos RUP (visión del sistema, visión del negocio, arquitectura del negocio, factibilidades) | Al final del proyecto |

### Módulos del prototipo

| Módulo | Nivel de implementación |
|---|---|
| Inventario por ubicación (lotes y vencimientos) | **Completo** |
| Traslados (bodega → farmacia y farmacia → farmacia) | **Completo** |
| Ventas, caja y flujo de efectivo | **Completo** |
| Call center: consulta de disponibilidad, pedidos y entregas | **Completo** |
| Planilla | CRUD + cálculo simple + reportes |
| Activos fijos | CRUD + depreciación lineal + reportes |
| Auditoría (dashboards, kardex, bitácora) | **Completo** (es el objetivo central del caso) |

---

## 3. Modelo de negocio

### 3.1 Ubicaciones

Todas las ubicaciones físicas se modelan con una sola entidad `Ubicacion`, con un campo `tipo`:

- `BODEGA_CENTRAL`: compra a proveedores y surte a las farmacias. No vende al público. Existe una sola.
- `FARMACIA_CC`: farmacia en centro comercial.
- `STAND_GASOLINERA`: stand en tienda de gasolinera.

`FARMACIA_CC` y `STAND_GASOLINERA` **operan exactamente igual** (venden, tienen caja, despachan entregas, tienen repartidores). El tipo solo sirve para clasificar y reportar.

Cada ubicación tiene departamento, municipio, dirección, latitud y longitud (necesarios para calcular tiempos de entrega).

### 3.2 Flujos principales

1. **Abastecimiento:** la bodega central registra compras a proveedores, con lote y vencimiento → envía traslados de reabastecimiento a las farmacias.
2. **Venta en mostrador:** el cajero abre turno de caja → vende → cobra en efectivo o tarjeta → cierra turno con arqueo.
3. **Pedido por call center:** el operador recibe la llamada → consulta disponibilidad con la dirección del cliente → el sistema propone la mejor sucursal con tiempo estimado y formas de pago → el operador crea el pedido → la sucursal lo prepara y asigna un repartidor → se entrega y se cobra.
4. **Traslado entre farmacias:** cuando una sucursal no tiene stock para un pedido o se queda corta, solicita producto a otra sucursal o a la bodega.
5. **Auditoría:** el auditor o el administrador consulta en cualquier momento el flujo de efectivo, el kardex de movimientos, los traslados, la planilla, el valor de los activos y la bitácora de acciones.

### 3.3 Formas de pago

- `EFECTIVO`
- `TARJETA` (solo se registra el pago y una referencia opcional, sin pasarela real)
- `CONTRA_ENTREGA` (solo para pedidos de call center; el cobro se registra al confirmar la entrega y entra a la caja de la sucursal que despachó)

### 3.4 Reglas de negocio

**Inventario**
- RN-01: la existencia se controla por `(ubicacion, lote)`. La cantidad **nunca** puede quedar negativa.
- RN-02: salidas por **FEFO**: siempre se descuenta primero el lote con la fecha de vencimiento más próxima. El sistema asigna los lotes automáticamente; el usuario no los elige.
- RN-03: está **prohibido** vender o trasladar lotes vencidos.
- RN-04: los lotes que vencen dentro de N días (configurable, 90 por defecto) generan una alerta de "próximo a vencer".
- RN-05: cada producto puede tener un stock mínimo por ubicación. Por debajo de ese mínimo, el sistema sugiere un reabastecimiento.
- RN-06: todo cambio de existencia genera un registro en `MovimientoInventario` (kardex). Los movimientos son **inmutables**: no se editan ni se borran. Las correcciones se hacen con un movimiento de tipo `AJUSTE` que exige motivo.
- RN-07: los lotes vencidos se dan de baja con un movimiento `BAJA_VENCIMIENTO`.

**Traslados**
- RN-08: estados: `SOLICITADO → APROBADO → EN_TRANSITO → RECIBIDO`, o `CANCELADO` antes de despacharse.
- RN-09: al despachar (`EN_TRANSITO`) se descuenta del origen; al recibir se suma en el destino, con el mismo lote. Si se recibe una cantidad distinta a la despachada, la diferencia se registra como `AJUSTE` con motivo.
- RN-10: un traslado puede estar vinculado a un pedido de cliente (motivo `PEDIDO_CLIENTE`) o ser de reabastecimiento (`REABASTECIMIENTO`).

**Ventas y caja**
- RN-11: no se puede vender sin un turno de caja abierto en esa ubicación por ese cajero.
- RN-12: al cerrar el turno, el cajero ingresa el efectivo contado. El sistema calcula el efectivo esperado y registra la diferencia (sobrante o faltante).
- RN-13: cada venta, gasto de caja, retiro o depósito genera un `MovimientoCaja`. Estos registros también son inmutables.
- RN-14: una venta puede anularse solo por el gerente, con motivo. La anulación revierte el inventario y la caja mediante movimientos nuevos, nunca borrando registros.

**Call center y entregas**
- RN-15: la consulta de disponibilidad recibe uno o varios productos con cantidades y una dirección o coordenadas de entrega. Devuelve las sucursales activas que tienen **todo** el pedido con lotes no vencidos, ordenadas por tiempo estimado.
- RN-16: tiempo estimado = tiempo de ruta (Google Maps) + tiempo de preparación configurable (15 min por defecto).
- RN-17: si ninguna sucursal tiene todo el pedido, el sistema propone la sucursal más cercana y un traslado desde otra ubicación con stock, sumando el tiempo de ese traslado al estimado.
- RN-18: al crear el pedido se fija una `fecha_compromiso`. Un pedido no entregado después de esa fecha se marca como **atrasado** y aparece resaltado en los dashboards del gerente y del administrador.
- RN-19: estados del pedido: `PENDIENTE → EN_PREPARACION → ASIGNADO → EN_CAMINO → ENTREGADO`, o `CANCELADO`.
- RN-20: los repartidores son empleados de la sucursal **sin acceso al sistema**. El gerente o el cajero asigna al repartidor y actualiza los estados.
- RN-21: el inventario se descuenta cuando el pedido pasa a `EN_PREPARACION`; en ese momento se genera la venta asociada con canal `CALL_CENTER`.

**Planilla (simplificada)**
- RN-22: planilla mensual por ubicación. Para cada empleado se registran salario base, bonificación incentivo (Q250 por defecto, configurable), descuento IGSS laboral (4.83 % del salario base, configurable) y otros descuentos. Líquido = salario + bonificación − descuentos.
- RN-23: una planilla cerrada no se modifica.

**Activos fijos (simplificado)**
- RN-24: depreciación lineal mensual = (costo − valor residual) / vida útil en meses. El valor en libros se calcula a cualquier fecha.
- RN-25: categorías con vida útil por defecto: Edificios (20 años), Mobiliario y equipo (5 años), Vehículos (5 años), Equipo de cómputo (3 años), Refrigeración médica (5 años). Son editables.
- RN-26: un activo puede trasladarse entre ubicaciones; queda historial del cambio.

**Auditoría transversal**
- RN-27: toda acción que crea, modifica o anula datos se registra en `Bitacora` con usuario, acción, entidad, id, datos antes y después, fecha e IP.
- RN-28: todos los montos se manejan en quetzales (GTQ), con `DECIMAL(12,2)`. Nunca se usa coma flotante para dinero.

---

## 4. Roles y permisos

| Rol | Alcance | Puede |
|---|---|---|
| `ADMIN` | Todas las ubicaciones | Todo: configuración, usuarios, catálogo, ubicaciones, aprobar traslados, planilla, activos y reportes |
| `GERENTE` | Su ubicación | Inventario, solicitar y recibir traslados, anular ventas, gestionar pedidos y entregas, empleados de su sucursal, planilla de su sucursal y reportes de su sucursal |
| `CAJERO` | Su ubicación | Abrir y cerrar caja, vender, consultar existencias, actualizar estados de entrega |
| `OPERADOR_CALL_CENTER` | Todas (solo lectura de stock) | Consultar disponibilidad, crear y cancelar pedidos, ver el seguimiento de pedidos, gestionar clientes |
| `AUDITOR` | Todas las ubicaciones | **Solo lectura** de todo: dashboards, kardex, caja, traslados, planilla, activos y bitácora. Puede exportar reportes |

- La bodega central la opera un usuario `GERENTE` asignado a esa ubicación (registra compras y despacha traslados).
- Los permisos se aplican **en el backend** con guards de NestJS: rol más filtro por ubicación. El frontend solo oculta opciones; no es la capa de seguridad.

---

## 5. Requisitos funcionales por módulo

### 5.1 Autenticación y administración
- RF-01: login con email y contraseña → JWT (access token). Contraseñas con bcrypt.
- RF-02: CRUD de usuarios (rol y ubicación), ubicaciones, categorías, productos y proveedores.
- RF-03: página de configuración: días de alerta de vencimiento, tiempo de preparación, bonificación, porcentaje IGSS y velocidad promedio del cálculo de respaldo.

### 5.2 Inventario
- RF-04: registrar compra en bodega (proveedor, productos, número de lote, vencimiento, cantidad, costo unitario).
- RF-05: consultar existencias por ubicación, con desglose por lote y vencimiento.
- RF-06: consulta global de stock de un producto en todas las ubicaciones.
- RF-07: kardex por producto y ubicación, con filtros de fechas y tipo de movimiento.
- RF-08: ajustes de inventario con motivo obligatorio.
- RF-09: alertas: próximos a vencer, vencidos pendientes de baja y bajo stock mínimo.
- RF-10: dar de baja lotes vencidos.

### 5.3 Traslados
- RF-11: solicitar traslado (origen, destino, productos y cantidades). Los lotes se asignan por FEFO al despachar.
- RF-12: aprobar (ADMIN o gerente de origen), despachar, recibir con cantidades reales y cancelar.
- RF-13: listado con filtros por estado, ubicación y fechas; detalle con historial de estados.

### 5.4 Ventas y caja
- RF-14: abrir turno de caja con monto inicial.
- RF-15: punto de venta: buscar producto por nombre, SKU o principio activo; agregar cantidades; el sistema valida stock y asigna lotes por FEFO; cobrar con uno o varios métodos de pago; cliente opcional (NIT o "CF").
- RF-16: registrar gastos menores, retiros y depósitos en caja.
- RF-17: cerrar turno con arqueo.
- RF-18: anular venta (solo gerente, con motivo).
- RF-19: comprobante de venta imprimible en pantalla (no es factura electrónica FEL).

### 5.5 Call center y entregas
- RF-20: gestión de clientes (nombre, teléfono, NIT, direcciones con coordenadas).
- RF-21: pantalla de consulta para el operador: buscar al cliente por teléfono → elegir dirección → agregar productos → **"Consultar disponibilidad"** → tabla de sucursales con stock completo, tiempo estimado, distancia y formas de pago, y la mejor opción resaltada (RN-15 a RN-17).
- RF-22: crear pedido con la sucursal elegida, método de pago y fecha de compromiso.
- RF-23: bandeja de pedidos por sucursal (gerente y cajero): cambiar estados y asignar repartidor.
- RF-24: confirmar entrega; si el pago es contra entrega, se registra en la caja abierta de la sucursal.
- RF-25: seguimiento de pedidos para el operador, con indicador de atrasado.

### 5.6 Planilla
- RF-26: CRUD de empleados (puesto, salario base, ubicación, fecha de ingreso, activo).
- RF-27: generar la planilla mensual de una ubicación a partir de los empleados activos, editar bonos y descuentos antes de cerrar, y cerrarla.
- RF-28: reporte de gasto en planilla por mes y por ubicación, más un consolidado.

### 5.7 Activos fijos
- RF-29: CRUD de activos (código, descripción, categoría, ubicación, fecha de adquisición, costo, valor residual y vida útil).
- RF-30: trasladar un activo entre ubicaciones, con historial.
- RF-31: reporte de valor en libros a una fecha, por ubicación y por categoría, con su depreciación acumulada.

### 5.8 Auditoría y dashboards
- RF-32: **dashboard ejecutivo** (ADMIN y AUDITOR): ventas del día, mes y año; flujo de efectivo por sucursal y por método de pago; pedidos atrasados; alertas de inventario; valor del inventario a costo; valor de activos; gasto en planilla del mes. Con gráficas.
- RF-33: **flujo de efectivo** consolidado y por sucursal, con filtros de fechas: ingresos por método, egresos, diferencias de arqueo y detalle de turnos de caja.
- RF-34: **movimiento de medicamentos**: kardex global y reporte de traslados entre ubicaciones.
- RF-35: **bitácora** consultable por usuario, entidad, acción y fechas.
- RF-36: exportar a CSV cualquier tabla de reporte.
- RF-37: dashboard de sucursal (GERENTE), con los mismos indicadores limitados a su ubicación.

---

## 6. Modelo de datos

Usar PostgreSQL con Prisma. Nombres de tablas y columnas en español, en `snake_case` en la base de datos (`@@map` / `@map`) y en `camelCase` en el código. Todas las tablas llevan `id` (UUID), `created_at` y `updated_at`, salvo las tablas inmutables, que solo llevan `created_at`.

Entidades mínimas (Claude Code puede agregar campos necesarios, pero no quitar):

- **Departamento**, **Municipio**: catálogo de Guatemala (22 departamentos). Basta con cargar los municipios de las ubicaciones del seed.
- **Ubicacion**: codigo, nombre, tipo, direccion, municipio_id, latitud, longitud, telefono, activa.
- **Usuario**: nombre, email (único), password_hash, rol, ubicacion_id (nulo para ADMIN, AUDITOR y OPERADOR), activo.
- **Empleado**: nombres, apellidos, dpi, puesto (`GERENTE`, `CAJERO`, `REPARTIDOR`, `BODEGUERO`, `OPERADOR`, `OTRO`), salario_base, ubicacion_id, fecha_ingreso, activo, usuario_id (opcional).
- **Categoria**, **Proveedor**.
- **Producto**: sku (único), nombre, principio_activo, presentacion, categoria_id, precio_venta, requiere_receta (solo informativo), activo.
- **Lote**: producto_id, numero_lote, fecha_vencimiento, costo_unitario, proveedor_id. Único: (producto_id, numero_lote).
- **Existencia**: ubicacion_id, lote_id, cantidad. Único: (ubicacion_id, lote_id). Con CHECK de cantidad ≥ 0.
- **StockMinimo**: ubicacion_id, producto_id, cantidad_minima.
- **MovimientoInventario** *(inmutable)*: tipo (`COMPRA`, `VENTA`, `ANULACION_VENTA`, `TRASLADO_SALIDA`, `TRASLADO_ENTRADA`, `AJUSTE`, `BAJA_VENCIMIENTO`), ubicacion_id, lote_id, cantidad (con signo), costo_unitario, referencia_tipo, referencia_id, motivo, usuario_id.
- **Compra**, **DetalleCompra**.
- **Traslado**: origen_id, destino_id, estado, motivo, pedido_id (opcional), solicitado_por, aprobado_por, fechas por estado. **DetalleTraslado**: producto_id, lote_id (al despachar), cantidad_enviada, cantidad_recibida.
- **Cliente**, **DireccionCliente** (con latitud y longitud).
- **TurnoCaja**: ubicacion_id, cajero_id, apertura, cierre, monto_inicial, efectivo_esperado, efectivo_contado, diferencia, estado.
- **MovimientoCaja** *(inmutable)*: turno_caja_id, tipo (`VENTA`, `COBRO_CONTRA_ENTREGA`, `GASTO`, `RETIRO`, `DEPOSITO`, `ANULACION`), metodo_pago, monto, referencia_id, descripcion, usuario_id.
- **Venta**: ubicacion_id, turno_caja_id, cliente_id (opcional), nit, canal (`MOSTRADOR`, `CALL_CENTER`), pedido_id (opcional), total, estado (`COMPLETADA`, `ANULADA`), motivo_anulacion. **DetalleVenta**: producto_id, lote_id, cantidad, precio_unitario, subtotal. **Pago**: venta_id, metodo, monto, referencia.
- **Pedido**: cliente_id, direccion_id, ubicacion_despacho_id, operador_id, estado, metodo_pago, tiempo_estimado_min, distancia_km, fecha_compromiso, fecha_entrega, observaciones. **DetallePedido**. **HistorialPedido** (cambios de estado con usuario y fecha).
- **Entrega**: pedido_id, repartidor_id (empleado), hora_salida, hora_entrega, notas.
- **Planilla**: ubicacion_id, mes, anio, estado (`BORRADOR`, `CERRADA`), total. **DetallePlanilla**: empleado_id, salario_base, bonificacion, igss, otros_descuentos, liquido.
- **CategoriaActivo** (vida_util_meses por defecto), **ActivoFijo**, **HistorialUbicacionActivo**.
- **Configuracion** (clave/valor).
- **Bitacora** *(inmutable)*: usuario_id, accion, entidad, entidad_id, datos_antes (JSONB), datos_despues (JSONB), ip.

Índices: existencias por ubicación, movimientos por (ubicacion, lote, created_at), pedidos por (estado, fecha_compromiso), ventas por (ubicacion, created_at) y movimientos de caja por turno.

**Diagrama E-R:** generarlo en formato Mermaid (`docs/diagrama-er.md`) a partir del `schema.prisma` final, y mantenerlo actualizado.

---

## 7. Arquitectura y stack

### 7.1 Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing / datos | React Router, TanStack Query |
| UI | Tailwind CSS + shadcn/ui **con tema propio** (sección 8.1), fuente Atkinson Hyperlegible Next, Recharts para gráficas, lucide-react para íconos |
| Formularios | react-hook-form + zod |
| Backend | NestJS (TypeScript) sobre Node.js LTS |
| ORM | Prisma |
| Base de datos | PostgreSQL en **Neon** |
| Autenticación | JWT (@nestjs/jwt + passport-jwt), bcrypt |
| Validación | class-validator / class-transformer (DTOs) |
| Documentación API | Swagger (@nestjs/swagger) en `/api/docs` |
| Mapas | Google Maps **Routes API** (Compute Route Matrix), invocada solo desde el backend |
| Pruebas | Jest (unitarias de reglas de negocio) |
| Despliegue | **Vercel** (frontend y backend como dos proyectos separados del mismo repo) |

> Verifica las versiones estables actuales al iniciar y fíjalas en `package.json`.

### 7.2 Arquitectura

- **Monolito modular** en NestJS: un módulo por dominio (`auth`, `usuarios`, `ubicaciones`, `catalogo`, `inventario`, `traslados`, `caja`, `ventas`, `clientes`, `pedidos`, `planilla`, `activos`, `reportes`, `bitacora`, `configuracion`, `mapas`).
- Capas dentro de cada módulo: controller (HTTP) → service (reglas de negocio) → Prisma. Las reglas de negocio viven **solo en los services**.
- Las operaciones que tocan inventario o caja usan **transacciones** de Prisma (`$transaction`) para garantizar la consistencia. Bloquear la fila de existencia (`SELECT ... FOR UPDATE` vía `$queryRaw`, o una actualización condicional `cantidad >= x`) para evitar ventas simultáneas del mismo stock.
- **API REST** bajo el prefijo `/api/v1`, documentada en Swagger. Esta API es el punto de integración futuro para el portal de clientes y el call center externo (requisito del caso): los endpoints de disponibilidad y de pedidos deben ser claros, estables y estar bien documentados.
- Interceptor global que registra la bitácora (RN-27) en las operaciones de escritura.
- Formato de error uniforme: `{ statusCode, message, error, detalles? }`. Las violaciones de reglas de negocio devuelven 422 con un mensaje claro en español.
- Paginación estándar: `?page=&limit=` → `{ data, total, page, limit }`.

### 7.3 Servicio de mapas

- `MapasService.calcularTiempos(origenes[], destino)` usa Routes API (`computeRouteMatrix`) con la API key en una variable de entorno del backend. Nunca se expone en el frontend.
- **Respaldo obligatorio:** si la API falla, no hay key o se excede la cuota, se calcula la distancia haversine × 1.3 (factor de ruta) a una velocidad promedio configurable (30 km/h por defecto). La respuesta indica qué método se usó (`fuente: "google" | "estimado"`), y la UI muestra un aviso discreto cuando el valor es estimado.
- Antes de llamar a la API se filtran las sucursales candidatas (las que tienen stock y, opcionalmente, las 10 más cercanas por haversine), para limitar el consumo.

### 7.4 Estructura del repositorio

```
/
├── apps/
│   ├── web/          # React + Vite
│   └── api/          # NestJS + Prisma
│       ├── prisma/   # schema.prisma, migraciones, seed.ts
│       └── api/      # punto de entrada serverless para Vercel
├── docs/             # diagrama-er.md, documentos RUP, manual de despliegue
├── ESPECIFICACION.md
└── package.json      # npm workspaces
```

### 7.5 Despliegue

- **Neon:** usar la cadena de conexión *pooled* (`DATABASE_URL`) para la aplicación y la conexión directa (`DIRECT_URL`) para las migraciones de Prisma.
- **Backend en Vercel:** NestJS corre como función serverless. Crear un handler que inicialice la app una sola vez y la reutilice entre invocaciones (caché del servidor Express), más un `vercel.json` con un rewrite de todas las rutas hacia ese handler. Consulta la documentación actual de Vercel para NestJS antes de implementarlo. Root directory del proyecto: `apps/api`.
- **Frontend en Vercel:** root directory `apps/web`, con un rewrite SPA a `index.html`. Variable `VITE_API_URL`.
- Configurar CORS en el backend para permitir solo el dominio del frontend (y `localhost` en desarrollo).
- Las migraciones se ejecutan en el build del backend (`prisma migrate deploy`) o manualmente; documentar cuál se eligió.
- Limitaciones aceptadas: arranques en frío de Vercel y suspensión de Neon por inactividad. Mantener las peticiones cortas; nada de tareas en segundo plano ni WebSockets. El indicador de pedidos atrasados se calcula al consultar, no con jobs programados.
- Crear `.env.example` en cada app y un `docs/despliegue.md` con los pasos completos.

---

## 8. Frontend: pantallas

- Login.
- Layout con barra lateral según el rol y selector de ubicación (solo ADMIN y AUDITOR, para filtrar).
- **Dashboard** (ejecutivo o de sucursal, según el rol).
- **Inventario:** existencias, detalle por lote, kardex, ajustes, alertas y bajas.
- **Compras** (bodega).
- **Traslados:** listado, nuevo y detalle con acciones según el estado.
- **Punto de venta** y **Caja** (abrir, movimientos y cerrar con arqueo).
- **Ventas:** historial, detalle y anulación.
- **Call center:** consulta de disponibilidad, nuevo pedido, seguimiento y clientes.
- **Pedidos de sucursal:** bandeja con cambio de estado y asignación de repartidor.
- **Planilla:** empleados, generar, editar y cerrar, reportes.
- **Activos fijos:** listado, detalle con historial y depreciación, reporte.
- **Auditoría:** flujo de efectivo, movimiento de medicamentos y bitácora.
- **Administración:** usuarios, ubicaciones, catálogo, proveedores y configuración.

UI en español, responsiva (el punto de venta y la bandeja de pedidos deben poder usarse en tablet), con estados de carga y error, y confirmación antes de acciones irreversibles (cerrar caja, anular, cerrar planilla).

### 8.1 Lineamientos de diseño visual

> **Obligatorio.** El sistema debe verse como software profesional hecho para una farmacia, no como una plantilla genérica. Antes de construir la primera pantalla, implementa estos tokens en `apps/web/src/styles/tokens.css` y mapéalos a las variables de tema de shadcn/ui. **No uses el tema por defecto de shadcn** (grises zinc/slate) ni los colores sueltos de Tailwind (`bg-blue-500`, `text-green-600`, etc.) en los componentes: todo color sale de un token.

#### Concepto

Ambiente de mostrador de farmacia: limpio, sereno y confiable. Un verde profundo tipo "botica" como color de marca (el verde es el color que el público asocia con farmacia, pero aquí apagado y sobrio, nunca brillante), fondos claros neutros y frescos, y colores de estado reservados para lo que realmente necesita atención: lotes por vencer, vencidos y pedidos atrasados. El usuario pasa horas frente a esta pantalla, así que el color se usa con moderación para que las alertas destaquen cuando aparecen.

#### Paleta

| Token | Hex | Uso |
|---|---|---|
| `--verde-botica` | `#1E5B4F` | Color primario: botones principales, ítem activo del menú, enlaces, encabezados de marca |
| `--verde-botica-oscuro` | `#164539` | Hover y presionado del primario |
| `--salvia` | `#E6F0EC` | Fondo de la fila o el ítem seleccionado, resaltado suave |
| `--fondo` | `#F5F7F6` | Fondo general de la aplicación (gris frío con un matiz verde; no crema) |
| `--superficie` | `#FFFFFF` | Paneles, tablas, formularios y modales |
| `--texto` | `#1D2A26` | Texto principal |
| `--texto-secundario` | `#5A6A65` | Etiquetas, ayudas y metadatos |
| `--borde` | `#D7DFDC` | Bordes de paneles, inputs y separadores de tabla |
| `--ambar` / `--ambar-fondo` | `#9A5B06` / `#FBF0DE` | Advertencia: lote por vencer, stock bajo, diferencia de arqueo |
| `--ladrillo` / `--ladrillo-fondo` | `#A3271C` / `#FBE9E7` | Error y peligro: lote vencido, pedido atrasado, anular, faltante |
| `--acero` / `--acero-fondo` | `#2E5A78` / `#E7EEF4` | Información y estados en proceso: en tránsito, en camino, en preparación |

Reglas de color:
- El verde de marca también indica estados correctos ("Recibido", "Entregado", "Vigente"). No agregues un verde de éxito distinto.
- Los colores de estado se usan siempre como **texto oscuro sobre su fondo claro** (por ejemplo, `--ladrillo` sobre `--ladrillo-fondo`), nunca como bloques saturados de color completo.
- El rojo ladrillo como fondo sólido solo aparece en botones de acciones destructivas (Anular venta, Dar de baja lote).
- Todo texto debe cumplir un contraste WCAG AA (4.5:1). Los valores de esta paleta ya cumplen; no los aclares.
- Sin modo oscuro (fuera de alcance).

#### Tipografía

- Una sola familia: **Atkinson Hyperlegible Next** (Google Fonts), con respaldo `system-ui, sans-serif`. Está diseñada para distinguir caracteres que se confunden (`l`, `1`, `I`, `0`, `O`), algo crítico al leer números de lote, SKU, dosis y montos.
- Cifras en tablas, montos y cantidades con `font-variant-numeric: tabular-nums`, alineadas a la derecha. Si la fuente no soporta cifras tabulares, usa `Public Sans` solo para las columnas numéricas.
- Escala: 13 px (metadatos), 14 px (tablas y cuerpo denso), 16 px (cuerpo y formularios), 20 px (título de sección), 26 px (título de página). Pesos: 400 normal, 600 títulos y énfasis. Nada de 800 o 900.
- Siempre en mayúscula inicial y minúsculas (sentence case). **Prohibido** usar etiquetas en MAYÚSCULAS con espaciado amplio, o resaltar una sola palabra de un título con otro color o en cursiva.
- No uses fuentes monoespaciadas para datos; los números de lote van en la misma familia.

#### Forma, bordes y sombras

- Radios: 4 px en chips y badges, 6 px en botones e inputs, 8 px en paneles y modales. Nunca botones totalmente redondeados (pill), salvo los indicadores de conteo.
- Bordes de 1 px con `--borde`. La jerarquía se construye con bordes y espacio, **no con sombras**.
- Sombra solo en elementos flotantes (menús desplegables, modales, toasts): `0 4px 16px rgba(29, 42, 38, 0.12)`.
- Espaciado en una escala de 4 px (4, 8, 12, 16, 24, 32, 48).

#### Componentes

- **Botones:** primario sólido `--verde-botica` con texto blanco; secundario con fondo blanco, borde `--borde` y texto `--texto`; destructivo sólido `--ladrillo`; terciario solo texto en verde. **Un solo botón primario por pantalla o por modal.** El foco visible es un anillo de 2 px en `--verde-botica` con 2 px de separación; nunca brillos ni resplandores.
- **Tablas:** son el componente principal del sistema. Encabezado con fondo `--fondo` y texto `--texto-secundario` en peso 600; filas de 44 px con separador inferior de 1 px; hover con `--salvia` muy sutil; números alineados a la derecha. Preferir tablas sobre cuadrículas de tarjetas para listar datos.
- **Badges de estado:** texto oscuro sobre fondo claro del color semántico, radio de 4 px y sin borde. Ejemplos: `EN_TRANSITO` → acero, `ATRASADO` → ladrillo, `ENTREGADO` → verde sobre salvia. Mostrar siempre el estado con texto legible ("En tránsito"), nunca el valor del enum.
- **Etiqueta de lote (elemento distintivo del sistema):** cada vez que se muestra un lote aparece como una pequeña etiqueta, inspirada en la etiqueta impresa de un frasco de farmacia: número de lote en peso 600 y fecha de vencimiento debajo o al lado, con una franja vertical de 3 px a la izquierda cuyo color indica la vigencia (verde botica si vence en más de N días, ámbar si está por vencer, ladrillo si está vencido). Es el único elemento visual "con personalidad"; todo lo demás se mantiene sobrio.
- **Menú lateral:** fondo `--superficie` con borde derecho; ítem activo con fondo `--salvia`, texto `--verde-botica` y una barra izquierda de 3 px en `--verde-botica`. Íconos lucide de 18 px y trazo 1.75, siempre acompañados de su texto. Logo sencillo: el nombre de la cadena en tipografía de 600 junto a una cruz de farmacia simple en verde botica.
- **Formularios:** etiqueta encima del campo, ayuda en `--texto-secundario` y errores en `--ladrillo` debajo del campo, explicando cómo corregir. Inputs de 40 px de alto (48 px en el punto de venta para uso táctil).
- **Toasts:** esquina inferior derecha, confirman la acción con el mismo verbo del botón ("Registrar venta" → "Venta registrada").

#### Layout por pantalla

- Contenido alineado a la izquierda, con ancho máximo de 1440 px. Título de la página y acciones en la misma fila (título a la izquierda, botón primario a la derecha).
- **Dashboard:** primero lo que requiere acción ("Requiere atención hoy": pedidos atrasados, lotes por vencer, stock bajo, cajas con diferencia), como una lista con enlaces directos. Después, una franja de indicadores dentro de **un solo panel** dividido por separadores verticales (no tarjetas sueltas con número gigante y degradado). Al final, las gráficas.
- **Punto de venta:** dos columnas; a la izquierda la búsqueda y los resultados, y a la derecha el ticket en curso con el total grande y el botón "Cobrar".
- **Call center:** flujo vertical cliente → dirección → productos → resultados. La sucursal recomendada aparece primero con un borde de 2 px en verde botica y su tiempo estimado bien visible.

#### Gráficas (Recharts)

- Paleta de series, en orden: `#1E5B4F`, `#6F9D8F`, `#2E5A78`, `#A9B7B2`. Máximo 4 series; si hay más, agrupa en "Otros".
- Cuadrícula horizontal tenue (`--borde`), sin cuadrícula vertical, ejes en `--texto-secundario` de 12 px y montos con formato `Q 1,234.56`.
- Los colores semánticos (ámbar, ladrillo) solo se usan en gráficas cuando representan ese significado (por ejemplo, faltantes de arqueo).

#### Prohibido (señales de diseño genérico o hecho por IA)

- Degradados, efectos de vidrio (glassmorphism), bordes o sombras brillantes y neón, y resplandores al hacer hover o foco.
- Colores fuera de la paleta, colores distintos para cada tarjeta o ícono, e íconos dentro de círculos de colores.
- Cuadrículas de tarjetas idénticas con sombra para todo; tarjetas de KPI con número gigante y degradado.
- Emojis en la interfaz, flechas "→" en botones o enlaces, y textos promocionales ("¡Potencia tu farmacia!").
- Animaciones de entrada al cargar páginas o secciones. Solo se permiten transiciones cortas (150 ms) que responden a una acción del usuario: abrir un menú, expandir una fila o mostrar un toast. Respetar `prefers-reduced-motion`.
- Ilustraciones genéricas en estados vacíos: un estado vacío lleva un texto breve que dice qué hacer y el botón para hacerlo ("Aún no hay traslados. Crear traslado").

#### Textos de la interfaz

- Verbos concretos en botones: "Registrar venta", "Cerrar caja", "Despachar traslado", "Consultar disponibilidad". Nunca "Enviar" o "Aceptar" cuando hay un verbo más preciso.
- La misma acción se nombra igual en todo el flujo.
- Los errores dicen qué pasó y cómo resolverlo, sin disculpas: "No hay existencia suficiente: quedan 4 unidades vigentes de Amoxicilina 500 mg".
- Fechas en formato `dd/mm/aaaa`, montos en `Q 1,234.56` y horas en formato de 24 h.

---

## 9. Datos de prueba (seed)

El script `prisma/seed.ts` debe ser idempotente y crear datos realistas para la demostración:

- 1 bodega central en la Ciudad de Guatemala.
- Al menos 8 sucursales en departamentos del interior, mezclando `FARMACIA_CC` (por ejemplo en Quetzaltenango, Escuintla, Huehuetenango, Cobán y Petén) y `STAND_GASOLINERA` (por ejemplo en Chimaltenango, Zacapa y Retalhuleu), con coordenadas aproximadas reales.
- Un usuario por rol (y un gerente y un cajero por sucursal), con contraseñas conocidas documentadas en el README.
- 40 o más productos genéricos comunes (acetaminofén, ibuprofeno, amoxicilina, loratadina, omeprazol, etc.) con varios lotes por producto: algunos ya vencidos, otros por vencer y otros con vencimiento lejano.
- Existencias repartidas, incluyendo productos que solo existen en algunas sucursales, para demostrar la sugerencia de traslado del call center.
- Unos 3 meses de historia: compras, traslados, ventas, turnos de caja (incluidos algunos con diferencias de arqueo) y pedidos (incluidos algunos atrasados).
- Empleados, repartidores, 2 planillas cerradas y activos fijos por sucursal.

---

## 10. Requisitos no funcionales

- **Seguridad:** autorización en el backend por rol y ubicación; validación de todo input; nada de secretos en el código; rate limiting básico en el login.
- **Integridad:** transacciones en inventario y caja; registros inmutables para movimientos y bitácora; montos en DECIMAL.
- **Rendimiento:** las consultas de dashboards y reportes deben usar agregaciones en SQL, no traer todo a memoria.
- **Calidad:** TypeScript estricto, ESLint + Prettier, pruebas unitarias de las reglas críticas (FEFO, no negativos, vencidos, cálculo de arqueo, selección de sucursal, depreciación, planilla).
- **Mantenibilidad:** README con instalación local, variables de entorno, usuarios de prueba y despliegue.

---

## 11. Supuestos

- Moneda única GTQ; precios de venta iguales en todas las sucursales.
- No hay facturación electrónica (FEL); el comprobante es interno.
- `requiere_receta` es informativo: muestra un aviso en el punto de venta, pero no bloquea la venta.
- Los pagos con tarjeta no se procesan; solo se registran.
- Los repartidores no usan el sistema.
- Una sola bodega central.

---

## 12. Plan de fases para Claude Code

| Fase | Contenido | Criterio de terminado |
|---|---|---|
| 0 | Monorepo, NestJS + Prisma + Neon, React + Vite, lint, despliegue "hola mundo" de ambos proyectos en Vercel | Frontend desplegado consume `/api/v1/health` del backend desplegado |
| 1 | Esquema Prisma completo, migraciones, auth JWT, guards de rol y ubicación, CRUD de administración, bitácora | Login funcional por rol; permisos probados |
| 2 | Inventario: compras, lotes, existencias, FEFO, kardex, ajustes, alertas, bajas | Pruebas de FEFO, no negativos y vencidos en verde |
| 3 | Traslados completos | Ciclo de vida completo con kardex correcto |
| 4 | Caja, punto de venta, ventas y anulaciones | Arqueo correcto; anulación revierte todo |
| 5 | Clientes, servicio de mapas con respaldo, consulta de disponibilidad, pedidos, entregas y atrasos | Flujo del call center de punta a punta, incluida la sugerencia de traslado |
| 6 | Planilla y activos fijos | Cálculos correctos en pruebas |
| 7 | Dashboards, reportes de auditoría y exportación CSV | Indicadores coinciden con los datos del seed |
| 8 | Seed completo, pulido de UI, README, `docs/despliegue.md`, despliegue final | Demo completa funcionando en producción |
| 9 | Diagrama E-R en Mermaid y documentos RUP en `docs/` | Ver sección 13 |

---

## 13. Entregables documentales (fase final)

Generar en `docs/`, basados en el sistema realmente construido:

1. **Documento de visión del negocio:** problema, objetivos de la expansión, actores del negocio y procesos actuales vs. propuestos.
2. **Documento de visión del sistema:** alcance, stakeholders, características principales, restricciones y supuestos.
3. **Arquitectura del negocio:** casos de uso del negocio, modelo de dominio y flujos principales (diagramas Mermaid de actividad y secuencia para venta, traslado y pedido de call center).
4. **Análisis de factibilidad:** técnica (stack y despliegue), operativa (adopción por roles) y económica (costos de nube con capas gratuitas en el prototipo vs. una estimación a escala, en el marco de la inversión de US$5,000,000 del caso).
5. **Diagrama E-R** (ya generado en la fase 9).
6. **Análisis de requerimientos** siguiendo RUP: requisitos funcionales (sección 5), no funcionales (sección 10) y casos de uso del sistema por actor.

---

## 14. Fuera de alcance

- Portal de clientes y call center telefónico real (solo se deja la API preparada).
- Pasarela de pagos, facturación electrónica FEL e integración contable.
- App para repartidores o rastreo GPS en tiempo real.
- Compras automáticas a proveedores y predicción de demanda.
- Notificaciones por correo, SMS o push.
- Multimoneda y precios diferenciados por sucursal.
