import { SetMetadata } from '@nestjs/common';

export const CLAVE_AUDITAR = 'auditar';
export const CLAVE_SIN_BITACORA = 'sin-bitacora';

/** Delegados de Prisma de los que se puede leer el estado anterior de un registro. */
export type ModeloAuditable =
  | 'usuario'
  | 'ubicacion'
  | 'categoria'
  | 'producto'
  | 'proveedor'
  | 'configuracion'
  | 'traslado'
  | 'cliente'
  | 'pedido';

export interface OpcionesAuditoria {
  /** Nombre legible de la entidad que se guarda en la bitácora, por ejemplo "Usuario". */
  entidad: string;
  /** Si se indica y la ruta tiene `:id`, se guarda el registro antes del cambio. */
  modelo?: ModeloAuditable;
  /** Acción explícita; por defecto se deduce del método HTTP. */
  accion?: string;
  /** Parámetro de ruta que identifica el registro (por defecto `id`). */
  parametroId?: string;
}

/** Describe cómo registrar en la bitácora una operación de escritura. */
export const Auditar = (opciones: OpcionesAuditoria) => SetMetadata(CLAVE_AUDITAR, opciones);

/** Excluye una operación de escritura de la bitácora (cuando el servicio la registra por su cuenta). */
export const SinBitacora = () => SetMetadata(CLAVE_SIN_BITACORA, true);
