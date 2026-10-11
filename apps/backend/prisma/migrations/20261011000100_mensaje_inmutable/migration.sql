-- El error de los registros inmutables usa el código por defecto de RAISE (P0001) para que
-- el mensaje llegue tal cual a la aplicación. Con restrict_violation, Prisma lo reportaba
-- como una violación de llave foránea.
CREATE OR REPLACE FUNCTION "impedir_modificacion_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable: no se permite %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
