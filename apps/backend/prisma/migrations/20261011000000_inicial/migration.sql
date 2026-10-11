-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "tipo_ubicacion" AS ENUM ('BODEGA_CENTRAL', 'FARMACIA_CC', 'STAND_GASOLINERA');

-- CreateEnum
CREATE TYPE "rol" AS ENUM ('ADMIN', 'GERENTE', 'CAJERO', 'OPERADOR_CALL_CENTER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "puesto" AS ENUM ('GERENTE', 'CAJERO', 'REPARTIDOR', 'BODEGUERO', 'OPERADOR', 'OTRO');

-- CreateEnum
CREATE TYPE "tipo_movimiento_inventario" AS ENUM ('COMPRA', 'VENTA', 'ANULACION_VENTA', 'TRASLADO_SALIDA', 'TRASLADO_ENTRADA', 'AJUSTE', 'BAJA_VENCIMIENTO');

-- CreateEnum
CREATE TYPE "estado_traslado" AS ENUM ('SOLICITADO', 'APROBADO', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "motivo_traslado" AS ENUM ('REABASTECIMIENTO', 'PEDIDO_CLIENTE');

-- CreateEnum
CREATE TYPE "estado_turno_caja" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "tipo_movimiento_caja" AS ENUM ('VENTA', 'COBRO_CONTRA_ENTREGA', 'GASTO', 'RETIRO', 'DEPOSITO', 'ANULACION');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('EFECTIVO', 'TARJETA', 'CONTRA_ENTREGA');

-- CreateEnum
CREATE TYPE "canal_venta" AS ENUM ('MOSTRADOR', 'CALL_CENTER');

-- CreateEnum
CREATE TYPE "estado_venta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "estado_pedido" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "estado_planilla" AS ENUM ('BORRADOR', 'CERRADA');

-- CreateTable
CREATE TABLE "departamento" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipio" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicacion" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_ubicacion" NOT NULL,
    "direccion" TEXT NOT NULL,
    "municipio_id" UUID NOT NULL,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,
    "telefono" VARCHAR(20),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "rol" NOT NULL,
    "ubicacion_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleado" (
    "id" UUID NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "dpi" VARCHAR(13) NOT NULL,
    "puesto" "puesto" NOT NULL,
    "salario_base" DECIMAL(12,2) NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "fecha_ingreso" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" VARCHAR(20) NOT NULL,
    "telefono" VARCHAR(20),
    "email" TEXT,
    "direccion" TEXT,
    "contacto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(30) NOT NULL,
    "nombre" TEXT NOT NULL,
    "principio_activo" TEXT NOT NULL,
    "presentacion" TEXT NOT NULL,
    "categoria_id" UUID NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "requiere_receta" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "numero_lote" VARCHAR(40) NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "proveedor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencia" (
    "id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "existencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_minimo" (
    "id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad_minima" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_minimo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" UUID NOT NULL,
    "tipo" "tipo_movimiento_inventario" NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "referencia_tipo" VARCHAR(30),
    "referencia_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "numero_documento" VARCHAR(40),
    "fecha" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_compra" (
    "id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslado" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "origen_id" UUID NOT NULL,
    "destino_id" UUID NOT NULL,
    "estado" "estado_traslado" NOT NULL DEFAULT 'SOLICITADO',
    "motivo" "motivo_traslado" NOT NULL,
    "pedido_id" UUID,
    "observaciones" TEXT,
    "motivo_cancelacion" TEXT,
    "solicitado_por" UUID NOT NULL,
    "aprobado_por" UUID,
    "despachado_por" UUID,
    "recibido_por" UUID,
    "cancelado_por" UUID,
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_aprobacion" TIMESTAMP(3),
    "fecha_despacho" TIMESTAMP(3),
    "fecha_recepcion" TIMESTAMP(3),
    "fecha_cancelacion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traslado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_traslado" (
    "id" UUID NOT NULL,
    "traslado_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "lote_id" UUID,
    "cantidad_solicitada" INTEGER NOT NULL,
    "cantidad_enviada" INTEGER,
    "cantidad_recibida" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_traslado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "nit" VARCHAR(20),
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direccion_cliente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "alias" VARCHAR(40),
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "municipio_id" UUID,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direccion_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno_caja" (
    "id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "cajero_id" UUID NOT NULL,
    "apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cierre" TIMESTAMP(3),
    "monto_inicial" DECIMAL(12,2) NOT NULL,
    "efectivo_esperado" DECIMAL(12,2),
    "efectivo_contado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "estado" "estado_turno_caja" NOT NULL DEFAULT 'ABIERTO',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turno_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" UUID NOT NULL,
    "turno_caja_id" UUID NOT NULL,
    "tipo" "tipo_movimiento_caja" NOT NULL,
    "metodo_pago" "metodo_pago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia_id" UUID,
    "descripcion" TEXT,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "turno_caja_id" UUID,
    "cliente_id" UUID,
    "nit" VARCHAR(20) NOT NULL DEFAULT 'CF',
    "canal" "canal_venta" NOT NULL,
    "pedido_id" UUID,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" "estado_venta" NOT NULL DEFAULT 'COMPLETADA',
    "motivo_anulacion" TEXT,
    "fecha_anulacion" TIMESTAMP(3),
    "anulada_por" UUID,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_venta" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "metodo" "metodo_pago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "direccion_id" UUID NOT NULL,
    "ubicacion_despacho_id" UUID NOT NULL,
    "operador_id" UUID NOT NULL,
    "estado" "estado_pedido" NOT NULL DEFAULT 'PENDIENTE',
    "metodo_pago" "metodo_pago" NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "tiempo_estimado_min" INTEGER NOT NULL,
    "distancia_km" DECIMAL(8,2) NOT NULL,
    "fuente_estimacion" VARCHAR(10) NOT NULL DEFAULT 'estimado',
    "fecha_compromiso" TIMESTAMP(3) NOT NULL,
    "fecha_entrega" TIMESTAMP(3),
    "observaciones" TEXT,
    "motivo_cancelacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_pedido" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_pedido" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "estado_anterior" "estado_pedido",
    "estado_nuevo" "estado_pedido" NOT NULL,
    "nota" TEXT,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "repartidor_id" UUID NOT NULL,
    "hora_salida" TIMESTAMP(3),
    "hora_entrega" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planilla" (
    "id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "mes" SMALLINT NOT NULL,
    "anio" SMALLINT NOT NULL,
    "estado" "estado_planilla" NOT NULL DEFAULT 'BORRADOR',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_cierre" TIMESTAMP(3),
    "cerrada_por" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_planilla" (
    "id" UUID NOT NULL,
    "planilla_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "salario_base" DECIMAL(12,2) NOT NULL,
    "bonificacion" DECIMAL(12,2) NOT NULL,
    "igss" DECIMAL(12,2) NOT NULL,
    "otros_descuentos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "liquido" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_planilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_activo" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "vida_util_meses" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categoria_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activo_fijo" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria_id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "fecha_adquisicion" DATE NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL,
    "valor_residual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vida_util_meses" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activo_fijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_ubicacion_activo" (
    "id" UUID NOT NULL,
    "activo_id" UUID NOT NULL,
    "ubicacion_origen_id" UUID,
    "ubicacion_destino_id" UUID NOT NULL,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_ubicacion_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "id" UUID NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "accion" VARCHAR(40) NOT NULL,
    "entidad" VARCHAR(60) NOT NULL,
    "entidad_id" VARCHAR(60),
    "datos_antes" JSONB,
    "datos_despues" JSONB,
    "ip" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departamento_codigo_key" ON "departamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "departamento_nombre_key" ON "departamento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "municipio_departamento_id_nombre_key" ON "municipio"("departamento_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ubicacion_codigo_key" ON "ubicacion"("codigo");

-- CreateIndex
CREATE INDEX "ubicacion_tipo_idx" ON "ubicacion"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_rol_idx" ON "usuario"("rol");

-- CreateIndex
CREATE INDEX "usuario_ubicacion_id_idx" ON "usuario"("ubicacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_dpi_key" ON "empleado"("dpi");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_usuario_id_key" ON "empleado"("usuario_id");

-- CreateIndex
CREATE INDEX "empleado_ubicacion_id_puesto_idx" ON "empleado"("ubicacion_id", "puesto");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_nit_key" ON "proveedor"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "producto_sku_key" ON "producto"("sku");

-- CreateIndex
CREATE INDEX "producto_nombre_idx" ON "producto"("nombre");

-- CreateIndex
CREATE INDEX "producto_principio_activo_idx" ON "producto"("principio_activo");

-- CreateIndex
CREATE INDEX "producto_categoria_id_idx" ON "producto"("categoria_id");

-- CreateIndex
CREATE INDEX "lote_producto_id_fecha_vencimiento_idx" ON "lote"("producto_id", "fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "lote_producto_id_numero_lote_key" ON "lote"("producto_id", "numero_lote");

-- CreateIndex
CREATE INDEX "existencia_ubicacion_id_idx" ON "existencia"("ubicacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "existencia_ubicacion_id_lote_id_key" ON "existencia"("ubicacion_id", "lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_minimo_ubicacion_id_producto_id_key" ON "stock_minimo"("ubicacion_id", "producto_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_ubicacion_id_lote_id_created_at_idx" ON "movimiento_inventario"("ubicacion_id", "lote_id", "created_at");

-- CreateIndex
CREATE INDEX "movimiento_inventario_created_at_idx" ON "movimiento_inventario"("created_at");

-- CreateIndex
CREATE INDEX "movimiento_inventario_referencia_tipo_referencia_id_idx" ON "movimiento_inventario"("referencia_tipo", "referencia_id");

-- CreateIndex
CREATE INDEX "compra_ubicacion_id_fecha_idx" ON "compra"("ubicacion_id", "fecha");

-- CreateIndex
CREATE INDEX "detalle_compra_compra_id_idx" ON "detalle_compra"("compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "traslado_numero_key" ON "traslado"("numero");

-- CreateIndex
CREATE INDEX "traslado_estado_idx" ON "traslado"("estado");

-- CreateIndex
CREATE INDEX "traslado_origen_id_created_at_idx" ON "traslado"("origen_id", "created_at");

-- CreateIndex
CREATE INDEX "traslado_destino_id_created_at_idx" ON "traslado"("destino_id", "created_at");

-- CreateIndex
CREATE INDEX "detalle_traslado_traslado_id_idx" ON "detalle_traslado"("traslado_id");

-- CreateIndex
CREATE INDEX "cliente_telefono_idx" ON "cliente"("telefono");

-- CreateIndex
CREATE INDEX "cliente_nit_idx" ON "cliente"("nit");

-- CreateIndex
CREATE INDEX "direccion_cliente_cliente_id_idx" ON "direccion_cliente"("cliente_id");

-- CreateIndex
CREATE INDEX "turno_caja_ubicacion_id_estado_idx" ON "turno_caja"("ubicacion_id", "estado");

-- CreateIndex
CREATE INDEX "turno_caja_cajero_id_estado_idx" ON "turno_caja"("cajero_id", "estado");

-- CreateIndex
CREATE INDEX "turno_caja_apertura_idx" ON "turno_caja"("apertura");

-- CreateIndex
CREATE INDEX "movimiento_caja_turno_caja_id_idx" ON "movimiento_caja"("turno_caja_id");

-- CreateIndex
CREATE INDEX "movimiento_caja_created_at_idx" ON "movimiento_caja"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "venta_numero_key" ON "venta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "venta_pedido_id_key" ON "venta"("pedido_id");

-- CreateIndex
CREATE INDEX "venta_ubicacion_id_created_at_idx" ON "venta"("ubicacion_id", "created_at");

-- CreateIndex
CREATE INDEX "venta_turno_caja_id_idx" ON "venta"("turno_caja_id");

-- CreateIndex
CREATE INDEX "detalle_venta_venta_id_idx" ON "detalle_venta"("venta_id");

-- CreateIndex
CREATE INDEX "pago_venta_id_idx" ON "pago"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_numero_key" ON "pedido"("numero");

-- CreateIndex
CREATE INDEX "pedido_estado_fecha_compromiso_idx" ON "pedido"("estado", "fecha_compromiso");

-- CreateIndex
CREATE INDEX "pedido_ubicacion_despacho_id_estado_idx" ON "pedido"("ubicacion_despacho_id", "estado");

-- CreateIndex
CREATE INDEX "pedido_cliente_id_idx" ON "pedido"("cliente_id");

-- CreateIndex
CREATE INDEX "detalle_pedido_pedido_id_idx" ON "detalle_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "historial_pedido_pedido_id_created_at_idx" ON "historial_pedido"("pedido_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "entrega_pedido_id_key" ON "entrega"("pedido_id");

-- CreateIndex
CREATE INDEX "entrega_repartidor_id_idx" ON "entrega"("repartidor_id");

-- CreateIndex
CREATE UNIQUE INDEX "planilla_ubicacion_id_anio_mes_key" ON "planilla"("ubicacion_id", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "detalle_planilla_planilla_id_empleado_id_key" ON "detalle_planilla"("planilla_id", "empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_activo_nombre_key" ON "categoria_activo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "activo_fijo_codigo_key" ON "activo_fijo"("codigo");

-- CreateIndex
CREATE INDEX "activo_fijo_ubicacion_id_idx" ON "activo_fijo"("ubicacion_id");

-- CreateIndex
CREATE INDEX "activo_fijo_categoria_id_idx" ON "activo_fijo"("categoria_id");

-- CreateIndex
CREATE INDEX "historial_ubicacion_activo_activo_id_created_at_idx" ON "historial_ubicacion_activo"("activo_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_clave_key" ON "configuracion"("clave");

-- CreateIndex
CREATE INDEX "bitacora_created_at_idx" ON "bitacora"("created_at");

-- CreateIndex
CREATE INDEX "bitacora_entidad_entidad_id_idx" ON "bitacora"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "bitacora_usuario_id_created_at_idx" ON "bitacora"("usuario_id", "created_at");

-- AddForeignKey
ALTER TABLE "municipio" ADD CONSTRAINT "municipio_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicacion" ADD CONSTRAINT "ubicacion_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_minimo" ADD CONSTRAINT "stock_minimo_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_minimo" ADD CONSTRAINT "stock_minimo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_compra" ADD CONSTRAINT "detalle_compra_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_compra" ADD CONSTRAINT "detalle_compra_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_compra" ADD CONSTRAINT "detalle_compra_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_despachado_por_fkey" FOREIGN KEY ("despachado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_recibido_por_fkey" FOREIGN KEY ("recibido_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_cancelado_por_fkey" FOREIGN KEY ("cancelado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_traslado" ADD CONSTRAINT "detalle_traslado_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "traslado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_traslado" ADD CONSTRAINT "detalle_traslado_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_traslado" ADD CONSTRAINT "detalle_traslado_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direccion_cliente" ADD CONSTRAINT "direccion_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direccion_cliente" ADD CONSTRAINT "direccion_cliente_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "turno_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_anulada_por_fkey" FOREIGN KEY ("anulada_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "direccion_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_ubicacion_despacho_id_fkey" FOREIGN KEY ("ubicacion_despacho_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_pedido" ADD CONSTRAINT "historial_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_pedido" ADD CONSTRAINT "historial_pedido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planilla" ADD CONSTRAINT "planilla_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planilla" ADD CONSTRAINT "planilla_cerrada_por_fkey" FOREIGN KEY ("cerrada_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_planilla" ADD CONSTRAINT "detalle_planilla_planilla_id_fkey" FOREIGN KEY ("planilla_id") REFERENCES "planilla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_planilla" ADD CONSTRAINT "detalle_planilla_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicacion_activo" ADD CONSTRAINT "historial_ubicacion_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo_fijo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicacion_activo" ADD CONSTRAINT "historial_ubicacion_activo_ubicacion_origen_id_fkey" FOREIGN KEY ("ubicacion_origen_id") REFERENCES "ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicacion_activo" ADD CONSTRAINT "historial_ubicacion_activo_ubicacion_destino_id_fkey" FOREIGN KEY ("ubicacion_destino_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicacion_activo" ADD CONSTRAINT "historial_ubicacion_activo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Reglas de integridad que Prisma no expresa en el esquema ────────────────

-- RN-01: la existencia nunca puede quedar negativa.
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_cantidad_no_negativa" CHECK ("cantidad" >= 0);
ALTER TABLE "stock_minimo" ADD CONSTRAINT "stock_minimo_cantidad_no_negativa" CHECK ("cantidad_minima" >= 0);
ALTER TABLE "planilla" ADD CONSTRAINT "planilla_mes_valido" CHECK ("mes" BETWEEN 1 AND 12);
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_vida_util_positiva" CHECK ("vida_util_meses" > 0);
ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_residual_valido" CHECK ("valor_residual" >= 0 AND "valor_residual" <= "costo");
ALTER TABLE "categoria_activo" ADD CONSTRAINT "categoria_activo_vida_util_positiva" CHECK ("vida_util_meses" > 0);

-- RN-06, RN-13, RN-27: kardex, movimientos de caja, bitácora e historiales son inmutables.
-- Las correcciones se hacen con registros nuevos, nunca editando o borrando.
CREATE FUNCTION "impedir_modificacion_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable: no se permite %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "movimiento_inventario_inmutable" BEFORE UPDATE OR DELETE ON "movimiento_inventario"
  FOR EACH ROW EXECUTE FUNCTION "impedir_modificacion_inmutable"();
CREATE TRIGGER "movimiento_caja_inmutable" BEFORE UPDATE OR DELETE ON "movimiento_caja"
  FOR EACH ROW EXECUTE FUNCTION "impedir_modificacion_inmutable"();
CREATE TRIGGER "bitacora_inmutable" BEFORE UPDATE OR DELETE ON "bitacora"
  FOR EACH ROW EXECUTE FUNCTION "impedir_modificacion_inmutable"();
CREATE TRIGGER "historial_pedido_inmutable" BEFORE UPDATE OR DELETE ON "historial_pedido"
  FOR EACH ROW EXECUTE FUNCTION "impedir_modificacion_inmutable"();
CREATE TRIGGER "historial_ubicacion_activo_inmutable" BEFORE UPDATE OR DELETE ON "historial_ubicacion_activo"
  FOR EACH ROW EXECUTE FUNCTION "impedir_modificacion_inmutable"();
