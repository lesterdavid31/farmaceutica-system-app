import { ForbiddenException } from '@nestjs/common';
import { EstadoPedido, Rol } from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';

/** Acciones sobre un pedido (RN-19 a RN-21, RF-23 y RF-24). */
export type AccionPedido = 'preparar' | 'asignar' | 'salir' | 'entregar' | 'cancelar';

export const ACCIONES_PEDIDO: readonly AccionPedido[] = [
  'preparar',
  'asignar',
  'salir',
  'entregar',
  'cancelar',
];

/**
 * RN-19: PENDIENTE → EN_PREPARACION → ASIGNADO → EN_CAMINO → ENTREGADO, o CANCELADO hasta
 * EN_CAMINO inclusive (decisión del equipo). Asignar desde ASIGNADO cambia de repartidor.
 */
export const ESTADOS_PREVIOS: Record<AccionPedido, readonly EstadoPedido[]> = {
  preparar: [EstadoPedido.PENDIENTE],
  asignar: [EstadoPedido.EN_PREPARACION, EstadoPedido.ASIGNADO],
  salir: [EstadoPedido.ASIGNADO],
  entregar: [EstadoPedido.EN_CAMINO],
  cancelar: [
    EstadoPedido.PENDIENTE,
    EstadoPedido.EN_PREPARACION,
    EstadoPedido.ASIGNADO,
    EstadoPedido.EN_CAMINO,
  ],
};

export const ESTADO_RESULTANTE: Record<AccionPedido, EstadoPedido> = {
  preparar: EstadoPedido.EN_PREPARACION,
  asignar: EstadoPedido.ASIGNADO,
  salir: EstadoPedido.EN_CAMINO,
  entregar: EstadoPedido.ENTREGADO,
  cancelar: EstadoPedido.CANCELADO,
};

export const ESTADOS_FINALES: readonly EstadoPedido[] = [
  EstadoPedido.ENTREGADO,
  EstadoPedido.CANCELADO,
];

const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  PENDIENTE: 'pendiente',
  EN_PREPARACION: 'en preparación',
  ASIGNADO: 'asignado',
  EN_CAMINO: 'en camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
};

const REQUISITO: Record<AccionPedido, string> = {
  preparar: 'solo se prepara un pedido pendiente',
  asignar: 'solo se asigna repartidor a un pedido en preparación o ya asignado',
  salir: 'solo sale a entrega un pedido con repartidor asignado',
  entregar: 'solo se entrega un pedido en camino',
  cancelar: 'un pedido entregado o cancelado no se puede cancelar',
};

type Actor = Pick<UsuarioAutenticado, 'rol' | 'ubicacionId'>;

/**
 * Quién opera (RN-20 y sección 4): el gerente y el cajero de la sucursal de despacho mueven el
 * pedido; cancelan el operador, el gerente de la sucursal y el administrador.
 */
export function puedeOperar(
  accion: AccionPedido,
  usuario: Actor,
  pedido: { ubicacionDespachoId: string },
) {
  if (usuario.rol === Rol.ADMIN) {
    return true;
  }
  const deLaSucursal = usuario.ubicacionId === pedido.ubicacionDespachoId;
  if (accion === 'cancelar') {
    return (
      usuario.rol === Rol.OPERADOR_CALL_CENTER || (usuario.rol === Rol.GERENTE && deLaSucursal)
    );
  }
  return (usuario.rol === Rol.GERENTE || usuario.rol === Rol.CAJERO) && deLaSucursal;
}

export function accionesDisponibles(
  pedido: { estado: EstadoPedido; ubicacionDespachoId: string },
  usuario: Actor,
): AccionPedido[] {
  return ACCIONES_PEDIDO.filter(
    (a) => ESTADOS_PREVIOS[a].includes(pedido.estado) && puedeOperar(a, usuario, pedido),
  );
}

export function verificarAccion(
  accion: AccionPedido,
  pedido: { numero: number; estado: EstadoPedido; ubicacionDespachoId: string },
  usuario: Actor,
) {
  if (!puedeOperar(accion, usuario, pedido)) {
    throw new ForbiddenException(
      accion === 'cancelar'
        ? 'Solo el operador, el gerente de la sucursal o un administrador cancela pedidos'
        : 'Solo el gerente o el cajero de la sucursal de despacho atiende este pedido',
    );
  }
  verificarEstado(accion, pedido);
}

export function verificarEstado(
  accion: AccionPedido,
  pedido: { numero: number; estado: EstadoPedido },
) {
  if (!ESTADOS_PREVIOS[accion].includes(pedido.estado)) {
    throw new ReglaNegocioException(
      `El pedido #${pedido.numero} está ${NOMBRE_ESTADO[pedido.estado]}: ${REQUISITO[accion]}`,
    );
  }
}

/** RN-18: atrasado si no se ha entregado (ni cancelado) y ya pasó la fecha de compromiso. */
export function estaAtrasado(
  pedido: { estado: EstadoPedido; fechaCompromiso: Date },
  ahora: Date = new Date(),
) {
  return !ESTADOS_FINALES.includes(pedido.estado) && pedido.fechaCompromiso < ahora;
}

export function minutosDeAtraso(
  pedido: { estado: EstadoPedido; fechaCompromiso: Date },
  ahora: Date = new Date(),
) {
  return estaAtrasado(pedido, ahora)
    ? Math.floor((ahora.getTime() - pedido.fechaCompromiso.getTime()) / 60_000)
    : 0;
}
