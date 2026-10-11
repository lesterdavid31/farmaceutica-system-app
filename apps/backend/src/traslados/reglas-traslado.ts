import { ForbiddenException } from '@nestjs/common';
import { EstadoTraslado, Rol } from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';

/** Acciones que cambian el estado de un traslado (RF-12). */
export type AccionTraslado = 'aprobar' | 'despachar' | 'recibir' | 'cancelar';

export const ACCIONES_TRASLADO: readonly AccionTraslado[] = [
  'aprobar',
  'despachar',
  'recibir',
  'cancelar',
];

/** Ciclo de vida (RN-08): SOLICITADO → APROBADO → EN_TRANSITO → RECIBIDO, o CANCELADO antes de despachar. */
export const ESTADOS_PREVIOS: Record<AccionTraslado, readonly EstadoTraslado[]> = {
  aprobar: [EstadoTraslado.SOLICITADO],
  despachar: [EstadoTraslado.APROBADO],
  recibir: [EstadoTraslado.EN_TRANSITO],
  cancelar: [EstadoTraslado.SOLICITADO, EstadoTraslado.APROBADO],
};

export const ESTADO_RESULTANTE: Record<AccionTraslado, EstadoTraslado> = {
  aprobar: EstadoTraslado.APROBADO,
  despachar: EstadoTraslado.EN_TRANSITO,
  recibir: EstadoTraslado.RECIBIDO,
  cancelar: EstadoTraslado.CANCELADO,
};

const NOMBRE_ESTADO: Record<EstadoTraslado, string> = {
  SOLICITADO: 'solicitado',
  APROBADO: 'aprobado',
  EN_TRANSITO: 'en tránsito',
  RECIBIDO: 'recibido',
  CANCELADO: 'cancelado',
};

const REQUISITO: Record<AccionTraslado, string> = {
  aprobar: 'solo se aprueba un traslado solicitado',
  despachar: 'solo se despacha un traslado aprobado',
  recibir: 'solo se recibe un traslado en tránsito',
  cancelar: 'solo se cancela un traslado que aún no se ha despachado',
};

const QUIEN: Record<AccionTraslado, string> = {
  aprobar:
    'Solo el gerente de la ubicación de origen o un administrador puede aprobar este traslado',
  despachar:
    'Solo el gerente de la ubicación de origen o un administrador puede despachar este traslado',
  recibir:
    'Solo el gerente de la ubicación de destino o un administrador puede recibir este traslado',
  cancelar:
    'Solo los gerentes de origen o destino o un administrador pueden cancelar este traslado',
};

interface TrasladoBase {
  numero: number;
  estado: EstadoTraslado;
  origenId: string;
  destinoId: string;
}

type Actor = Pick<UsuarioAutenticado, 'rol' | 'ubicacionId'>;

/**
 * Quién puede hacer cada acción (RF-12 y sección 4): ADMIN todas; el gerente de origen aprueba y
 * despacha; el de destino recibe; cualquiera de los dos cancela.
 */
export function puedeOperar(
  accion: AccionTraslado,
  usuario: Actor,
  traslado: Pick<TrasladoBase, 'origenId' | 'destinoId'>,
) {
  if (usuario.rol === Rol.ADMIN) {
    return true;
  }
  if (usuario.rol !== Rol.GERENTE || !usuario.ubicacionId) {
    return false;
  }
  switch (accion) {
    case 'aprobar':
    case 'despachar':
      return usuario.ubicacionId === traslado.origenId;
    case 'recibir':
      return usuario.ubicacionId === traslado.destinoId;
    case 'cancelar':
      return [traslado.origenId, traslado.destinoId].includes(usuario.ubicacionId);
  }
}

/** Acciones que el usuario puede ejecutar ahora sobre el traslado (para mostrar los botones). */
export function accionesDisponibles(traslado: TrasladoBase, usuario: Actor): AccionTraslado[] {
  return ACCIONES_TRASLADO.filter(
    (accion) =>
      ESTADOS_PREVIOS[accion].includes(traslado.estado) && puedeOperar(accion, usuario, traslado),
  );
}

/** Lanza 403 si el usuario no puede ejecutar la acción y 422 si el estado no la permite. */
export function verificarAccion(accion: AccionTraslado, traslado: TrasladoBase, usuario: Actor) {
  if (!puedeOperar(accion, usuario, traslado)) {
    throw new ForbiddenException(QUIEN[accion]);
  }
  verificarEstado(accion, traslado);
}

export function verificarEstado(
  accion: AccionTraslado,
  traslado: Pick<TrasladoBase, 'numero' | 'estado'>,
) {
  if (!ESTADOS_PREVIOS[accion].includes(traslado.estado)) {
    throw new ReglaNegocioException(
      `El traslado #${traslado.numero} está ${NOMBRE_ESTADO[traslado.estado]}: ${REQUISITO[accion]}`,
    );
  }
}

export interface FilaEnviada {
  id: string;
  cantidadEnviada: number;
  producto: string;
  numeroLote: string;
}

export interface FilaRecibida {
  detalleId: string;
  cantidadRecibida: number;
}

export interface Diferencia {
  detalleId: string;
  /** Unidades que faltaron: enviada − recibida (siempre positiva). */
  faltante: number;
}

/**
 * Valida las cantidades recibidas (RN-09): una por cada fila despachada, entre 0 y lo enviado.
 * No se acepta recibir más de lo despachado porque esas unidades no saldrían de ningún lote.
 * Si hay diferencias, exige el motivo. Devuelve las filas con faltante.
 */
export function validarRecepcion(
  enviadas: FilaEnviada[],
  recibidas: FilaRecibida[],
  motivoDiferencia?: string,
): Diferencia[] {
  const errores: string[] = [];
  const porId = new Map<string, FilaRecibida>();
  for (const r of recibidas) {
    if (porId.has(r.detalleId)) {
      errores.push('Hay filas repetidas en la recepción');
    }
    porId.set(r.detalleId, r);
  }
  const ids = new Set(enviadas.map((e) => e.id));
  if (recibidas.some((r) => !ids.has(r.detalleId))) {
    errores.push('La recepción incluye filas que no pertenecen al traslado');
  }

  const diferencias: Diferencia[] = [];
  for (const e of enviadas) {
    const r = porId.get(e.id);
    const fila = `${e.producto}, lote ${e.numeroLote}`;
    if (!r) {
      errores.push(`${fila}: indique la cantidad recibida`);
      continue;
    }
    if (!Number.isInteger(r.cantidadRecibida) || r.cantidadRecibida < 0) {
      errores.push(`${fila}: la cantidad recibida debe ser un entero mayor o igual a cero`);
    } else if (r.cantidadRecibida > e.cantidadEnviada) {
      errores.push(
        `${fila}: se despacharon ${e.cantidadEnviada} unidades; no puede recibir ${r.cantidadRecibida}`,
      );
    } else if (r.cantidadRecibida < e.cantidadEnviada) {
      diferencias.push({ detalleId: e.id, faltante: e.cantidadEnviada - r.cantidadRecibida });
    }
  }
  if (errores.length > 0) {
    throw new ReglaNegocioException('Revise las cantidades recibidas', [...new Set(errores)]);
  }
  if (diferencias.length > 0 && (motivoDiferencia?.trim().length ?? 0) < 5) {
    throw new ReglaNegocioException(
      'Hay diferencias entre lo despachado y lo recibido: explique el motivo (mínimo 5 caracteres)',
    );
  }
  return diferencias;
}
