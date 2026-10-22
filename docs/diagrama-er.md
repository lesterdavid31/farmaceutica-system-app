# Diagrama entidad-relación

Modelo de datos del sistema de gestión de la cadena de farmacias. Se generó a partir del esquema final [`apps/backend/prisma/schema.prisma`](../apps/backend/prisma/schema.prisma) y de las migraciones de [`apps/backend/prisma/migrations`](../apps/backend/prisma/migrations). Las restricciones que Prisma no puede declarar (CHECK, índices parciales y triggers) están en esas migraciones.

GitHub muestra los diagramas Mermaid directamente. Fuera de GitHub se pueden pegar en <https://mermaid.live>.

## Convenciones

- **Nombres:** se usan los nombres reales de la base de datos: tablas y columnas en español y en `snake_case`. En el código TypeScript, los mismos campos están en `camelCase`; por ejemplo, `fecha_vencimiento` es `fechaVencimiento`.
- **Claves primarias:** todas las tablas tienen `id` de tipo UUID.
- **Fechas de registro:**
  - Todas las tablas tienen `created_at` y `updated_at`. Para no repetirlas, los diagramas no las muestran.
  - Las tablas inmutables solo tienen `created_at`, y los diagramas sí la muestran porque ordena el historial.
- **Tablas inmutables:** `movimiento_inventario`, `movimiento_caja`, `historial_pedido`, `historial_ubicacion_activo` y `bitacora`. Un trigger rechaza cualquier `UPDATE` o `DELETE`; las correcciones se registran como movimientos nuevos.
- **Dinero:** `DECIMAL(12,2)`, nunca coma flotante. Coordenadas: `DECIMAL(9,6)`. Distancias: `DECIMAL(8,2)`.
- **Claves en los atributos:** `PK` es la clave primaria, `FK` una clave foránea y `UK` un valor único. Un comentario `null` indica que la columna admite nulos.

**Cardinalidad en Mermaid:**

| Símbolo                  | Significado                                                |
| ------------------------ | ---------------------------------------------------------- |
| `\|\|--o{`               | uno a cero o muchos                                        |
| `\|\|--\|{`              | uno a uno o muchos                                         |
| `\|o--o{`                | cero o uno a cero o muchos (la clave foránea admite nulos) |
| `\|\|--o\|` / `\|o--o\|` | uno a cero o uno                                           |

## 1. Vista general

Entidades y relaciones, sin atributos. Casi todas las tablas operativas pertenecen a una ubicación, y muchas registran qué usuario hizo la operación. Para que el diagrama se pueda leer, esas dos clases de relaciones no aparecen aquí; están en la [sección 3](#3-relaciones-con-ubicacion-y-con-usuario) y en los diagramas por módulo.

```mermaid
erDiagram
    departamento ||--o{ municipio : "tiene"
    municipio ||--o{ ubicacion : "localiza"
    municipio |o--o{ direccion_cliente : "localiza"

    usuario |o--o| empleado : "cuenta de"

    categoria ||--o{ producto : "clasifica"
    producto ||--o{ lote : "tiene"
    proveedor |o--o{ lote : "suministra"
    lote ||--o{ existencia : "se guarda en"
    producto ||--o{ stock_minimo : "tiene"
    lote ||--o{ movimiento_inventario : "kardex"

    proveedor ||--o{ compra : "vende"
    compra ||--|{ detalle_compra : "contiene"
    lote ||--o{ detalle_compra : "ingresa"

    traslado ||--|{ detalle_traslado : "contiene"
    lote |o--o{ detalle_traslado : "despacha"
    pedido |o--o{ traslado : "motiva"

    cliente ||--o{ direccion_cliente : "tiene"
    cliente ||--o{ pedido : "solicita"
    direccion_cliente ||--o{ pedido : "destino"
    pedido ||--|{ detalle_pedido : "contiene"
    pedido ||--|{ historial_pedido : "registra"
    pedido ||--o| entrega : "se entrega en"
    empleado ||--o{ entrega : "reparte"

    turno_caja ||--o{ movimiento_caja : "registra"
    turno_caja |o--o{ venta : "cobra"
    cliente |o--o{ venta : "compra"
    pedido |o--o| venta : "genera"
    venta ||--|{ detalle_venta : "contiene"
    lote ||--o{ detalle_venta : "sale de"
    venta ||--o{ pago : "se paga con"

    planilla ||--o{ detalle_planilla : "contiene"
    empleado ||--o{ detalle_planilla : "cobra"

    categoria_activo ||--o{ activo_fijo : "clasifica"
    activo_fijo ||--o{ historial_ubicacion_activo : "se traslada"

    usuario |o--o{ bitacora : "registra"
    configuracion
```

## 2. Diagramas por módulo

Cada diagrama muestra con atributos las tablas de su módulo. Las tablas de otros módulos aparecen solo con su nombre.

### 2.1 Geografía, ubicaciones, usuarios y empleados

```mermaid
erDiagram
    departamento ||--o{ municipio : "tiene"
    municipio ||--o{ ubicacion : "localiza"
    ubicacion |o--o{ usuario : "asignada a"
    ubicacion ||--o{ empleado : "emplea"
    usuario |o--o| empleado : "cuenta de"
    usuario |o--o{ bitacora : "registra"

    departamento {
        uuid id PK
        varchar codigo UK "2 dígitos"
        text nombre UK
    }
    municipio {
        uuid id PK
        text nombre "UK con departamento_id"
        uuid departamento_id FK
    }
    ubicacion {
        uuid id PK
        varchar codigo UK "BOD-CENTRAL, CC-XELA, SG-ZACAPA..."
        text nombre
        tipo_ubicacion tipo
        text direccion
        uuid municipio_id FK
        decimal latitud
        decimal longitud
        varchar telefono "null"
        boolean activa
    }
    usuario {
        uuid id PK
        text nombre
        text email UK
        text password_hash "bcrypt"
        rol rol
        uuid ubicacion_id FK "null en ADMIN, AUDITOR y OPERADOR_CALL_CENTER"
        boolean activo
    }
    empleado {
        uuid id PK
        text nombres
        text apellidos
        varchar dpi UK "13 dígitos (CHECK)"
        puesto puesto
        decimal salario_base "mayor que 0 (CHECK)"
        uuid ubicacion_id FK
        date fecha_ingreso
        boolean activo
        uuid usuario_id FK, UK "null"
    }
    configuracion {
        uuid id PK
        varchar clave UK
        text valor
        text descripcion "null"
    }
    bitacora {
        uuid id PK
        uuid usuario_id FK "null"
        varchar accion "CREAR, ACTUALIZAR, ANULAR, LOGIN..."
        varchar entidad
        varchar entidad_id "null"
        jsonb datos_antes "null"
        jsonb datos_despues "null"
        varchar ip "null"
        timestamp created_at "inmutable"
    }
```

### 2.2 Catálogo, inventario y compras

```mermaid
erDiagram
    categoria ||--o{ producto : "clasifica"
    producto ||--o{ lote : "tiene"
    proveedor |o--o{ lote : "suministra"
    ubicacion ||--o{ existencia : "almacena"
    lote ||--o{ existencia : "se guarda en"
    ubicacion ||--o{ stock_minimo : "define"
    producto ||--o{ stock_minimo : "tiene"
    ubicacion ||--o{ movimiento_inventario : "kardex"
    lote ||--o{ movimiento_inventario : "kardex"
    usuario ||--o{ movimiento_inventario : "registra"
    proveedor ||--o{ compra : "vende"
    ubicacion ||--o{ compra : "recibe"
    usuario ||--o{ compra : "registra"
    compra ||--|{ detalle_compra : "contiene"
    producto ||--o{ detalle_compra : "compra"
    lote ||--o{ detalle_compra : "ingresa"

    categoria {
        uuid id PK
        text nombre UK
        text descripcion "null"
        boolean activa
    }
    proveedor {
        uuid id PK
        text nombre
        varchar nit UK
        varchar telefono "null"
        text email "null"
        text direccion "null"
        text contacto "null"
        boolean activo
    }
    producto {
        uuid id PK
        varchar sku UK
        text nombre
        text principio_activo
        text presentacion
        uuid categoria_id FK
        decimal precio_venta
        boolean requiere_receta "solo informativo"
        boolean activo
    }
    lote {
        uuid id PK
        uuid producto_id FK "UK con numero_lote"
        varchar numero_lote
        date fecha_vencimiento
        decimal costo_unitario
        uuid proveedor_id FK "null"
    }
    existencia {
        uuid id PK
        uuid ubicacion_id FK "UK con lote_id"
        uuid lote_id FK
        int cantidad "mayor o igual que 0 (CHECK)"
    }
    stock_minimo {
        uuid id PK
        uuid ubicacion_id FK "UK con producto_id"
        uuid producto_id FK
        int cantidad_minima "mayor o igual que 0 (CHECK)"
    }
    movimiento_inventario {
        uuid id PK
        tipo_movimiento_inventario tipo
        uuid ubicacion_id FK
        uuid lote_id FK
        int cantidad "con signo: positivo entra, negativo sale"
        decimal costo_unitario
        varchar referencia_tipo "null: COMPRA, VENTA, TRASLADO, AJUSTE, BAJA"
        uuid referencia_id "null"
        text motivo "null"
        uuid usuario_id FK
        timestamp created_at "inmutable"
    }
    compra {
        uuid id PK
        uuid proveedor_id FK
        uuid ubicacion_id FK
        varchar numero_documento "null"
        date fecha
        decimal total
        text observaciones "null"
        uuid usuario_id FK
    }
    detalle_compra {
        uuid id PK
        uuid compra_id FK
        uuid producto_id FK
        uuid lote_id FK
        int cantidad
        decimal costo_unitario
        decimal subtotal
    }
```

### 2.3 Traslados

Al solicitar un traslado se guardan el producto y la cantidad solicitada, sin lote. Al despachar, el sistema asigna los lotes por FEFO; un producto puede repartirse en varias filas de `detalle_traslado`, una por lote.

```mermaid
erDiagram
    ubicacion ||--o{ traslado : "origen"
    ubicacion ||--o{ traslado : "destino"
    pedido |o--o{ traslado : "motiva"
    usuario ||--o{ traslado : "solicita"
    usuario |o--o{ traslado : "aprueba"
    usuario |o--o{ traslado : "despacha"
    usuario |o--o{ traslado : "recibe"
    usuario |o--o{ traslado : "cancela"
    traslado ||--|{ detalle_traslado : "contiene"
    producto ||--o{ detalle_traslado : "solicita"
    lote |o--o{ detalle_traslado : "despacha"

    traslado {
        uuid id PK
        int numero UK "correlativo"
        uuid origen_id FK
        uuid destino_id FK
        estado_traslado estado
        motivo_traslado motivo
        uuid pedido_id FK "null"
        text observaciones "null"
        text motivo_cancelacion "null"
        uuid solicitado_por FK
        uuid aprobado_por FK "null"
        uuid despachado_por FK "null"
        uuid recibido_por FK "null"
        uuid cancelado_por FK "null"
        timestamp fecha_solicitud
        timestamp fecha_aprobacion "null"
        timestamp fecha_despacho "null"
        timestamp fecha_recepcion "null"
        timestamp fecha_cancelacion "null"
    }
    detalle_traslado {
        uuid id PK
        uuid traslado_id FK
        uuid producto_id FK
        uuid lote_id FK "null hasta despachar"
        int cantidad_solicitada
        int cantidad_enviada "null hasta despachar"
        int cantidad_recibida "null hasta recibir"
    }
```

### 2.4 Caja y ventas

```mermaid
erDiagram
    ubicacion ||--o{ turno_caja : "abre"
    usuario ||--o{ turno_caja : "cajero"
    turno_caja ||--o{ movimiento_caja : "registra"
    usuario ||--o{ movimiento_caja : "registra"
    turno_caja |o--o{ venta : "cobra"
    ubicacion ||--o{ venta : "vende"
    cliente |o--o{ venta : "compra"
    pedido |o--o| venta : "genera"
    usuario ||--o{ venta : "registra"
    usuario |o--o{ venta : "anula"
    venta ||--|{ detalle_venta : "contiene"
    producto ||--o{ detalle_venta : "vende"
    lote ||--o{ detalle_venta : "sale de"
    venta ||--o{ pago : "se paga con"

    turno_caja {
        uuid id PK
        uuid ubicacion_id FK
        uuid cajero_id FK "un solo turno ABIERTO por cajero"
        timestamp apertura
        timestamp cierre "null mientras está abierto"
        decimal monto_inicial "mayor o igual que 0 (CHECK)"
        decimal efectivo_esperado "null mientras está abierto"
        decimal efectivo_contado "null mientras está abierto"
        decimal diferencia "contado menos esperado"
        estado_turno_caja estado
        text observaciones "null"
    }
    movimiento_caja {
        uuid id PK
        uuid turno_caja_id FK
        tipo_movimiento_caja tipo
        metodo_pago metodo_pago
        decimal monto "con signo, distinto de 0 (CHECK)"
        uuid referencia_id "null: venta que lo origina"
        text descripcion "null"
        uuid usuario_id FK
        timestamp created_at "inmutable"
    }
    venta {
        uuid id PK
        int numero UK "correlativo"
        uuid ubicacion_id FK
        uuid turno_caja_id FK "null en call center: el cobro va en movimiento_caja"
        uuid cliente_id FK "null"
        varchar nit "CF por defecto"
        canal_venta canal
        uuid pedido_id FK, UK "null"
        decimal total "mayor o igual que 0 (CHECK)"
        estado_venta estado
        text motivo_anulacion "null"
        timestamp fecha_anulacion "null"
        uuid anulada_por FK "null"
        uuid usuario_id FK
    }
    detalle_venta {
        uuid id PK
        uuid venta_id FK
        uuid producto_id FK
        uuid lote_id FK "asignado por FEFO"
        int cantidad "mayor que 0 (CHECK)"
        decimal precio_unitario
        decimal subtotal
    }
    pago {
        uuid id PK
        uuid venta_id FK
        metodo_pago metodo
        decimal monto "mayor que 0 (CHECK)"
        varchar referencia "null: autorización de tarjeta"
    }
```

### 2.5 Clientes, pedidos y entregas

```mermaid
erDiagram
    cliente ||--o{ direccion_cliente : "tiene"
    municipio |o--o{ direccion_cliente : "localiza"
    cliente ||--o{ pedido : "solicita"
    direccion_cliente ||--o{ pedido : "destino"
    ubicacion ||--o{ pedido : "despacha"
    usuario ||--o{ pedido : "operador"
    pedido ||--|{ detalle_pedido : "contiene"
    producto ||--o{ detalle_pedido : "pide"
    pedido ||--|{ historial_pedido : "registra"
    usuario ||--o{ historial_pedido : "cambia estado"
    pedido ||--o| entrega : "se entrega en"
    empleado ||--o{ entrega : "reparte"
    pedido |o--o| venta : "genera"
    pedido |o--o{ traslado : "motiva"

    cliente {
        uuid id PK
        text nombre
        varchar telefono
        varchar nit "null"
        text email "null"
        boolean activo
    }
    direccion_cliente {
        uuid id PK
        uuid cliente_id FK
        varchar alias "null: Casa, Oficina..."
        text direccion
        text referencia "null"
        uuid municipio_id FK "null"
        decimal latitud
        decimal longitud
        boolean principal
        boolean activa
    }
    pedido {
        uuid id PK
        int numero UK "correlativo"
        uuid cliente_id FK
        uuid direccion_id FK
        uuid ubicacion_despacho_id FK
        uuid operador_id FK
        estado_pedido estado
        metodo_pago metodo_pago
        decimal total
        int tiempo_estimado_min
        decimal distancia_km
        varchar fuente_estimacion "google o estimado"
        timestamp fecha_compromiso
        timestamp fecha_entrega "null"
        text observaciones "null"
        text motivo_cancelacion "null"
    }
    detalle_pedido {
        uuid id PK
        uuid pedido_id FK
        uuid producto_id FK
        int cantidad
        decimal precio_unitario
        decimal subtotal
    }
    historial_pedido {
        uuid id PK
        uuid pedido_id FK
        estado_pedido estado_anterior "null al crear"
        estado_pedido estado_nuevo
        text nota "null"
        uuid usuario_id FK
        timestamp created_at "inmutable"
    }
    entrega {
        uuid id PK
        uuid pedido_id FK, UK
        uuid repartidor_id FK "empleado con puesto REPARTIDOR"
        timestamp hora_salida "null"
        timestamp hora_entrega "null"
        text notas "null"
    }
```

### 2.6 Planilla y activos fijos

```mermaid
erDiagram
    ubicacion ||--o{ planilla : "paga"
    usuario |o--o{ planilla : "cierra"
    planilla ||--o{ detalle_planilla : "contiene"
    empleado ||--o{ detalle_planilla : "cobra"
    categoria_activo ||--o{ activo_fijo : "clasifica"
    ubicacion ||--o{ activo_fijo : "resguarda"
    activo_fijo ||--o{ historial_ubicacion_activo : "se traslada"
    ubicacion |o--o{ historial_ubicacion_activo : "origen"
    ubicacion ||--o{ historial_ubicacion_activo : "destino"
    usuario ||--o{ historial_ubicacion_activo : "registra"

    planilla {
        uuid id PK
        uuid ubicacion_id FK "UK con anio y mes"
        smallint mes "1 a 12 (CHECK)"
        smallint anio
        estado_planilla estado
        decimal total
        timestamp fecha_cierre "null"
        uuid cerrada_por FK "null"
    }
    detalle_planilla {
        uuid id PK
        uuid planilla_id FK "UK con empleado_id"
        uuid empleado_id FK
        decimal salario_base
        decimal bonificacion "parámetro, Q250 por defecto"
        decimal igss "porcentaje del salario base, 4.83 por defecto"
        decimal otros_descuentos
        decimal liquido "salario + bonificación - IGSS - otros (CHECK)"
    }
    categoria_activo {
        uuid id PK
        text nombre UK
        int vida_util_meses "por defecto, mayor que 0 (CHECK)"
    }
    activo_fijo {
        uuid id PK
        varchar codigo UK
        text descripcion
        uuid categoria_id FK
        uuid ubicacion_id FK "ubicación actual"
        date fecha_adquisicion
        decimal costo "mayor que 0 (CHECK)"
        decimal valor_residual "entre 0 y el costo (CHECK)"
        int vida_util_meses "mayor que 0 (CHECK)"
        boolean activo
    }
    historial_ubicacion_activo {
        uuid id PK
        uuid activo_id FK
        uuid ubicacion_origen_id FK "null en el alta"
        uuid ubicacion_destino_id FK
        text motivo "null"
        uuid usuario_id FK
        timestamp created_at "inmutable"
    }
```

## 3. Relaciones con ubicación y con usuario

### Ubicación

Las ubicaciones son la bodega central, las farmacias y los stands. Todas estas tablas tienen una clave foránea hacia `ubicacion`:

| Tabla                        | Columna                                       | Significado                                             |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `usuario`                    | `ubicacion_id`                                | Ubicación asignada; nulo en los roles de alcance global |
| `empleado`                   | `ubicacion_id`                                | Lugar de trabajo                                        |
| `existencia`                 | `ubicacion_id`                                | Dónde está guardado el lote                             |
| `stock_minimo`               | `ubicacion_id`                                | Ubicación a la que aplica el mínimo                     |
| `movimiento_inventario`      | `ubicacion_id`                                | Ubicación cuyo kardex cambia                            |
| `compra`                     | `ubicacion_id`                                | Ubicación que recibe la mercadería                      |
| `traslado`                   | `origen_id`, `destino_id`                     | Ubicación que envía y ubicación que recibe              |
| `turno_caja`                 | `ubicacion_id`                                | Caja donde se abre el turno                             |
| `venta`                      | `ubicacion_id`                                | Ubicación que vende                                     |
| `pedido`                     | `ubicacion_despacho_id`                       | Ubicación que prepara y despacha el pedido              |
| `planilla`                   | `ubicacion_id`                                | Ubicación cuya planilla se calcula                      |
| `activo_fijo`                | `ubicacion_id`                                | Ubicación actual del activo                             |
| `historial_ubicacion_activo` | `ubicacion_origen_id`, `ubicacion_destino_id` | De dónde salió y a dónde llegó el activo                |

### Usuario

Además de su ubicación y su ficha de empleado, `usuario` queda registrado en cada operación que realiza:

| Tabla                        | Columna                                                                             | Papel del usuario                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `movimiento_inventario`      | `usuario_id`                                                                        | Registra el movimiento del kardex                           |
| `compra`                     | `usuario_id`                                                                        | Registra la compra                                          |
| `traslado`                   | `solicitado_por`, `aprobado_por`, `despachado_por`, `recibido_por`, `cancelado_por` | Actúa en cada cambio de estado                              |
| `turno_caja`                 | `cajero_id`                                                                         | Abre y cierra el turno                                      |
| `movimiento_caja`            | `usuario_id`                                                                        | Registra el movimiento de caja                              |
| `venta`                      | `usuario_id`, `anulada_por`                                                         | Registra la venta; el gerente la anula                      |
| `pedido`                     | `operador_id`                                                                       | Toma el pedido en el call center                            |
| `historial_pedido`           | `usuario_id`                                                                        | Cambia el estado del pedido                                 |
| `planilla`                   | `cerrada_por`                                                                       | Cierra la planilla                                          |
| `historial_ubicacion_activo` | `usuario_id`                                                                        | Traslada el activo                                          |
| `bitacora`                   | `usuario_id`                                                                        | Realiza la acción auditada; es nulo en acciones del sistema |

## 4. Enumeraciones

| Tipo                         | Valores                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tipo_ubicacion`             | `BODEGA_CENTRAL`, `FARMACIA_CC`, `STAND_GASOLINERA`                                                       |
| `rol`                        | `ADMIN`, `GERENTE`, `CAJERO`, `OPERADOR_CALL_CENTER`, `AUDITOR`                                           |
| `puesto`                     | `GERENTE`, `CAJERO`, `REPARTIDOR`, `BODEGUERO`, `OPERADOR`, `OTRO`                                        |
| `tipo_movimiento_inventario` | `COMPRA`, `VENTA`, `ANULACION_VENTA`, `TRASLADO_SALIDA`, `TRASLADO_ENTRADA`, `AJUSTE`, `BAJA_VENCIMIENTO` |
| `estado_traslado`            | `SOLICITADO`, `APROBADO`, `EN_TRANSITO`, `RECIBIDO`, `CANCELADO`                                          |
| `motivo_traslado`            | `REABASTECIMIENTO`, `PEDIDO_CLIENTE`                                                                      |
| `estado_turno_caja`          | `ABIERTO`, `CERRADO`                                                                                      |
| `tipo_movimiento_caja`       | `VENTA`, `COBRO_CONTRA_ENTREGA`, `GASTO`, `RETIRO`, `DEPOSITO`, `ANULACION`                               |
| `metodo_pago`                | `EFECTIVO`, `TARJETA`, `CONTRA_ENTREGA`                                                                   |
| `canal_venta`                | `MOSTRADOR`, `CALL_CENTER`                                                                                |
| `estado_venta`               | `COMPLETADA`, `ANULADA`                                                                                   |
| `estado_pedido`              | `PENDIENTE`, `EN_PREPARACION`, `ASIGNADO`, `EN_CAMINO`, `ENTREGADO`, `CANCELADO`                          |
| `estado_planilla`            | `BORRADOR`, `CERRADA`                                                                                     |

## 5. Reglas de integridad en la base de datos

Estas reglas se cumplen en PostgreSQL aunque una consulta no pase por la API.

| Tabla                                                                                                    | Regla                                                                                                        | Mecanismo                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `existencia`                                                                                             | La cantidad nunca es negativa (RN-01)                                                                        | `CHECK (cantidad >= 0)`                                           |
| `stock_minimo`                                                                                           | El mínimo no es negativo                                                                                     | `CHECK (cantidad_minima >= 0)`                                    |
| `movimiento_inventario`, `movimiento_caja`, `historial_pedido`, `historial_ubicacion_activo`, `bitacora` | No se modifican ni se borran                                                                                 | Trigger `BEFORE UPDATE OR DELETE`                                 |
| `turno_caja`                                                                                             | Un cajero tiene a lo sumo un turno abierto (RN-11)                                                           | Índice único parcial sobre `cajero_id` `WHERE estado = 'ABIERTO'` |
| `turno_caja`                                                                                             | Un turno cerrado tiene cierre, efectivo esperado, efectivo contado y diferencia                              | `CHECK`                                                           |
| `turno_caja`                                                                                             | El monto inicial y el efectivo contado no son negativos                                                      | `CHECK`                                                           |
| `movimiento_caja`                                                                                        | El monto no es cero                                                                                          | `CHECK (monto <> 0)`                                              |
| `venta`                                                                                                  | El total no es negativo                                                                                      | `CHECK`                                                           |
| `detalle_venta`                                                                                          | La cantidad es positiva                                                                                      | `CHECK`                                                           |
| `pago`                                                                                                   | El monto es positivo                                                                                         | `CHECK`                                                           |
| `empleado`                                                                                               | El DPI tiene 13 dígitos y el salario es positivo                                                             | `CHECK`                                                           |
| `planilla`                                                                                               | El mes está entre 1 y 12                                                                                     | `CHECK`                                                           |
| `planilla`, `detalle_planilla`                                                                           | Una planilla cerrada y sus líneas no se modifican ni se borran (RN-23)                                       | Trigger                                                           |
| `detalle_planilla`                                                                                       | Los montos no son negativos y el líquido cuadra con salario + bonificación − IGSS − otros descuentos (RN-22) | `CHECK`                                                           |
| `activo_fijo`, `categoria_activo`                                                                        | La vida útil es positiva; el costo es positivo; el valor residual está entre 0 y el costo                    | `CHECK`                                                           |

**Valores únicos compuestos:**

- `municipio` (`departamento_id`, `nombre`)
- `lote` (`producto_id`, `numero_lote`)
- `existencia` (`ubicacion_id`, `lote_id`)
- `stock_minimo` (`ubicacion_id`, `producto_id`)
- `planilla` (`ubicacion_id`, `anio`, `mes`)
- `detalle_planilla` (`planilla_id`, `empleado_id`)

**Relaciones uno a uno:**

- `empleado.usuario_id`: una cuenta de usuario pertenece a un solo empleado.
- `venta.pedido_id`: un pedido genera una sola venta.
- `entrega.pedido_id`: un pedido tiene una sola entrega.

## 6. Referencias sin clave foránea

Tres columnas apuntan a filas de varias tablas posibles, por eso no tienen clave foránea:

- **`movimiento_inventario.referencia_tipo` y `referencia_id`:** el documento que originó el movimiento. `COMPRA` apunta a `compra`, `VENTA` a `venta`, `TRASLADO` a `traslado`; `AJUSTE` y `BAJA` no tienen documento propio.
- **`movimiento_caja.referencia_id`:** la venta de un movimiento `VENTA`, `COBRO_CONTRA_ENTREGA` o `ANULACION`. Es nulo en gastos, retiros y depósitos.
- **`bitacora.entidad` y `entidad_id`:** la tabla y el registro afectados por la acción auditada.

## 7. Índices

Además de las claves primarias y los valores únicos, la base tiene estos índices; los primeros cinco los pide la especificación (sección 6):

| Tabla                                                                           | Columnas                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `existencia`                                                                    | `ubicacion_id`                                                    |
| `movimiento_inventario`                                                         | `ubicacion_id`, `lote_id`, `created_at`                           |
| `pedido`                                                                        | `estado`, `fecha_compromiso`                                      |
| `venta`                                                                         | `ubicacion_id`, `created_at`                                      |
| `movimiento_caja`                                                               | `turno_caja_id`                                                   |
| `movimiento_inventario`                                                         | `created_at`; `referencia_tipo`, `referencia_id`                  |
| `movimiento_caja`                                                               | `created_at`                                                      |
| `ubicacion`                                                                     | `tipo`                                                            |
| `usuario`                                                                       | `rol`; `ubicacion_id`                                             |
| `empleado`                                                                      | `ubicacion_id`, `puesto`                                          |
| `producto`                                                                      | `nombre`; `principio_activo`; `categoria_id`                      |
| `lote`                                                                          | `producto_id`, `fecha_vencimiento` (consulta FEFO)                |
| `compra`                                                                        | `ubicacion_id`, `fecha`                                           |
| `traslado`                                                                      | `estado`; `origen_id`, `created_at`; `destino_id`, `created_at`   |
| `cliente`                                                                       | `telefono`; `nit`                                                 |
| `direccion_cliente`                                                             | `cliente_id`                                                      |
| `turno_caja`                                                                    | `ubicacion_id`, `estado`; `cajero_id`, `estado`; `apertura`       |
| `venta`                                                                         | `turno_caja_id`                                                   |
| `pedido`                                                                        | `ubicacion_despacho_id`, `estado`; `cliente_id`                   |
| `historial_pedido`                                                              | `pedido_id`, `created_at`                                         |
| `entrega`                                                                       | `repartidor_id`                                                   |
| `activo_fijo`                                                                   | `ubicacion_id`; `categoria_id`                                    |
| `historial_ubicacion_activo`                                                    | `activo_id`, `created_at`                                         |
| `bitacora`                                                                      | `created_at`; `entidad`, `entidad_id`; `usuario_id`, `created_at` |
| `detalle_compra`, `detalle_traslado`, `detalle_venta`, `pago`, `detalle_pedido` | La clave foránea hacia su documento                               |

## 8. Mantenimiento

Este documento debe cambiar junto con el esquema. Cuando una migración agregue o cambie una tabla, una columna, una relación o una restricción, hay que actualizar aquí el diagrama del módulo, la vista general si cambia una relación, y las secciones 4 a 7 si corresponde.
