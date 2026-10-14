-- Fase 6: integridad de planilla y activos fijos.

ALTER TABLE "empleado" ADD CONSTRAINT "empleado_salario_positivo" CHECK ("salario_base" > 0);
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_dpi_valido" CHECK ("dpi" ~ '^[0-9]{13}$');

ALTER TABLE "detalle_planilla" ADD CONSTRAINT "detalle_planilla_montos_no_negativos" CHECK (
  "salario_base" > 0 AND "bonificacion" >= 0 AND "igss" >= 0 AND "otros_descuentos" >= 0 AND "liquido" >= 0
);
-- RN-22: el líquido siempre es salario + bonificación − IGSS − otros descuentos.
ALTER TABLE "detalle_planilla" ADD CONSTRAINT "detalle_planilla_liquido_cuadra" CHECK (
  "liquido" = "salario_base" + "bonificacion" - "igss" - "otros_descuentos"
);

ALTER TABLE "activo_fijo" ADD CONSTRAINT "activo_fijo_costo_positivo" CHECK ("costo" > 0);

-- RN-23: una planilla cerrada no se modifica ni se borra, y tampoco sus líneas.
CREATE OR REPLACE FUNCTION "impedir_cambio_planilla_cerrada"() RETURNS trigger AS $$
DECLARE
  estado_planilla "estado_planilla";
BEGIN
  IF TG_TABLE_NAME = 'planilla' THEN
    IF OLD."estado" = 'CERRADA' THEN
      RAISE EXCEPTION 'La planilla está cerrada: no se permite %', TG_OP;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT p."estado" INTO estado_planilla FROM "planilla" p
  WHERE p."id" = COALESCE(NEW."planilla_id", OLD."planilla_id");
  IF estado_planilla = 'CERRADA' THEN
    RAISE EXCEPTION 'La planilla está cerrada: no se permite % en sus líneas', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "planilla_cerrada_inmutable" BEFORE UPDATE OR DELETE ON "planilla"
  FOR EACH ROW EXECUTE FUNCTION "impedir_cambio_planilla_cerrada"();
CREATE TRIGGER "detalle_planilla_cerrada_inmutable" BEFORE INSERT OR UPDATE OR DELETE ON "detalle_planilla"
  FOR EACH ROW EXECUTE FUNCTION "impedir_cambio_planilla_cerrada"();
