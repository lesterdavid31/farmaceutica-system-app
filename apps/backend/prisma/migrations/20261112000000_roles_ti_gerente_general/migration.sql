-- Separación de funciones: el ADMIN queda como administrador de TI y se agrega el gerente general.
-- Solicitudes de cuenta: el gerente de sucursal pide, el gerente general aprueba y TI crea la cuenta.

-- CreateEnum
CREATE TYPE "estado_solicitud_usuario" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ATENDIDA');

-- AlterEnum
ALTER TYPE "rol" ADD VALUE 'GERENTE_GENERAL';

-- CreateTable
CREATE TABLE "solicitud_usuario" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rol" "rol" NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "justificacion" TEXT,
    "estado" "estado_solicitud_usuario" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por" UUID NOT NULL,
    "revisado_por" UUID,
    "fecha_revision" TIMESTAMP(3),
    "motivo_rechazo" TEXT,
    "atendido_por" UUID,
    "fecha_atencion" TIMESTAMP(3),
    "usuario_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_usuario_numero_key" ON "solicitud_usuario"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_usuario_usuario_id_key" ON "solicitud_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "solicitud_usuario_estado_created_at_idx" ON "solicitud_usuario"("estado", "created_at");

-- CreateIndex
CREATE INDEX "solicitud_usuario_ubicacion_id_estado_idx" ON "solicitud_usuario"("ubicacion_id", "estado");

-- AddForeignKey
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_atendido_por_fkey" FOREIGN KEY ("atendido_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Solo se solicitan cuentas de sucursal.
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_rol_de_sucursal" CHECK ("rol" IN ('GERENTE', 'CAJERO'));
-- Cada estado guarda lo que lo justifica.
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_rechazo_con_motivo" CHECK (
  "estado" <> 'RECHAZADA' OR ("motivo_rechazo" IS NOT NULL AND "revisado_por" IS NOT NULL)
);
ALTER TABLE "solicitud_usuario" ADD CONSTRAINT "solicitud_usuario_atendida_con_usuario" CHECK (
  "estado" <> 'ATENDIDA' OR ("usuario_id" IS NOT NULL AND "atendido_por" IS NOT NULL)
);
-- Un correo no puede tener dos solicitudes en curso.
CREATE UNIQUE INDEX "solicitud_usuario_email_en_curso" ON "solicitud_usuario" (lower("email"))
  WHERE "estado" IN ('PENDIENTE', 'APROBADA');
