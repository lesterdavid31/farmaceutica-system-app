import { EstadoSolicitudUsuario, Rol } from '../generated/prisma/enums';

/**
 * Solicitudes de cuenta (separación de funciones):
 * - el gerente de sucursal pide cuentas de gerente o cajero para su ubicación;
 * - el gerente general las aprueba o rechaza (las suyas nacen aprobadas);
 * - el administrador de TI crea la cuenta de las aprobadas.
 */
export const ROLES_SOLICITABLES = [Rol.GERENTE, Rol.CAJERO] as const;

export type AccionSolicitud = 'aprobar' | 'rechazar' | 'crearCuenta';

interface Actor {
  rol: Rol;
  ubicacionId: string | null;
}

/** Devuelve el motivo por el que el actor no puede pedir una cuenta para esa ubicación, o null. */
export function motivoNoPuedeSolicitar(actor: Actor, ubicacionId: string): string | null {
  if (actor.rol === Rol.GERENTE_GENERAL) {
    return null;
  }
  if (actor.rol === Rol.GERENTE && actor.ubicacionId === ubicacionId) {
    return null;
  }
  return 'Solo puede solicitar cuentas para su propia ubicación';
}

/** Estado con el que nace una solicitud: la del gerente general ya va aprobada. */
export function estadoInicial(actor: Actor): EstadoSolicitudUsuario {
  return actor.rol === Rol.GERENTE_GENERAL
    ? EstadoSolicitudUsuario.APROBADA
    : EstadoSolicitudUsuario.PENDIENTE;
}

const ESTADO_REQUERIDO: Record<AccionSolicitud, EstadoSolicitudUsuario> = {
  aprobar: EstadoSolicitudUsuario.PENDIENTE,
  rechazar: EstadoSolicitudUsuario.PENDIENTE,
  crearCuenta: EstadoSolicitudUsuario.APROBADA,
};

const ROL_REQUERIDO: Record<AccionSolicitud, Rol> = {
  aprobar: Rol.GERENTE_GENERAL,
  rechazar: Rol.GERENTE_GENERAL,
  crearCuenta: Rol.ADMIN,
};

export const MENSAJE_ESTADO: Record<AccionSolicitud, string> = {
  aprobar: 'Solo se aprueban solicitudes pendientes',
  rechazar: 'Solo se rechazan solicitudes pendientes',
  crearCuenta: 'Solo se crea la cuenta de solicitudes aprobadas',
};

export function puedeHacer(
  accion: AccionSolicitud,
  actor: Actor,
  solicitud: { estado: EstadoSolicitudUsuario },
) {
  return actor.rol === ROL_REQUERIDO[accion] && solicitud.estado === ESTADO_REQUERIDO[accion];
}

export function accionesDisponibles(
  solicitud: { estado: EstadoSolicitudUsuario },
  actor: Actor,
): AccionSolicitud[] {
  return (['aprobar', 'rechazar', 'crearCuenta'] as const).filter((a) =>
    puedeHacer(a, actor, solicitud),
  );
}
