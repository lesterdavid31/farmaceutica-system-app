-- Fase 4: integridad de caja y ventas.

-- RN-11: un cajero tiene a lo sumo un turno de caja abierto. Índice parcial: Prisma no lo puede
-- declarar en el esquema, por eso vive solo en la migración.
CREATE UNIQUE INDEX "turno_caja_un_abierto_por_cajero" ON "turno_caja"("cajero_id") WHERE "estado" = 'ABIERTO';

ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_monto_inicial_no_negativo" CHECK ("monto_inicial" >= 0);
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_contado_no_negativo" CHECK ("efectivo_contado" IS NULL OR "efectivo_contado" >= 0);
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_cierre_completo" CHECK (
  "estado" = 'ABIERTO' OR ("cierre" IS NOT NULL AND "efectivo_esperado" IS NOT NULL AND "efectivo_contado" IS NOT NULL AND "diferencia" IS NOT NULL)
);
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_monto_distinto_de_cero" CHECK ("monto" <> 0);
ALTER TABLE "venta" ADD CONSTRAINT "venta_total_no_negativo" CHECK ("total" >= 0);
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "pago" ADD CONSTRAINT "pago_monto_positivo" CHECK ("monto" > 0);
