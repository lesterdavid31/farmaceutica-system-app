import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  EstadoTraslado,
  MotivoTraslado,
  Rol,
  TipoMovimientoInventario,
  TipoUbicacion,
} from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { esRolGlobal, UsuarioAutenticado } from '../common/usuario-autenticado';
import { sumarDias } from '../inventario/fefo';
import { MotorInventarioService, Tx } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccionTraslado,
  accionesDisponibles,
  ESTADO_RESULTANTE,
  ESTADOS_PREVIOS,
  validarRecepcion,
  verificarAccion,
  verificarEstado,
} from './reglas-traslado';
import {
  CancelarTrasladoDto,
  CrearTrasladoDto,
  FiltroTrasladosDto,
  RecibirTrasladoDto,
} from './traslados.dto';

const REFERENCIA = 'TRASLADO';

const usuarioResumen = { select: { id: true, nombre: true } } as const;
const ubicacionResumen = { select: { id: true, codigo: true, nombre: true, tipo: true } } as const;

type Cabecera = Prisma.TrasladoGetPayload<{
  include: { origen: { select: { nombre: true } }; destino: { select: { nombre: true } } };
}>;

/**
 * Traslados entre ubicaciones (RF-11 a RF-13, RN-08 a RN-10).
 *
 * Cada operación tiene una versión `...En(tx, ...)` que trabaja dentro de la transacción del
 * llamador: la API la envuelve en su propia transacción y las pruebas la ejecutan en una que se
 * revierte, porque el kardex es inmutable.
 */
@Injectable()
export class TrasladosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorInventarioService,
  ) {}

  // ─── API ──────────────────────────────────────────────────────────────────────

  async crear(dto: CrearTrasladoDto, usuario: UsuarioAutenticado) {
    const id = await this.enTransaccion((tx) => this.crearEn(tx, dto, usuario));
    return this.obtener(id, usuario);
  }

  async aprobar(id: string, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.aprobarEn(tx, id, usuario));
    return this.obtener(id, usuario);
  }

  async despachar(id: string, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.despacharEn(tx, id, usuario));
    return this.obtener(id, usuario);
  }

  async recibir(id: string, dto: RecibirTrasladoDto, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.recibirEn(tx, id, dto, usuario));
    return this.obtener(id, usuario);
  }

  async cancelar(id: string, dto: CancelarTrasladoDto, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.cancelarEn(tx, id, dto, usuario));
    return this.obtener(id, usuario);
  }

  private enTransaccion<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn, OPCIONES_TRANSACCION);
  }

  // ─── Operaciones ──────────────────────────────────────────────────────────────

  /** Solicita un traslado (RF-11). Los lotes no se eligen aquí: se asignan por FEFO al despachar. */
  async crearEn(tx: Tx, dto: CrearTrasladoDto, usuario: UsuarioAutenticado): Promise<string> {
    if (
      usuario.rol === Rol.GERENTE &&
      ![dto.origenId, dto.destinoId].includes(usuario.ubicacionId!)
    ) {
      throw new ForbiddenException(
        'Solo puede solicitar traslados que salgan de su ubicación o lleguen a ella',
      );
    }
    if (dto.origenId === dto.destinoId) {
      throw new ReglaNegocioException('El origen y el destino deben ser ubicaciones distintas');
    }
    const ubicaciones = await tx.ubicacion.findMany({
      where: { id: { in: [dto.origenId, dto.destinoId] } },
    });
    const origen = ubicaciones.find((u) => u.id === dto.origenId);
    const destino = ubicaciones.find((u) => u.id === dto.destinoId);
    if (!origen?.activa) {
      throw new ReglaNegocioException('La ubicación de origen no existe o está desactivada');
    }
    if (!destino?.activa) {
      throw new ReglaNegocioException('La ubicación de destino no existe o está desactivada');
    }
    if (destino.tipo === TipoUbicacion.BODEGA_CENTRAL) {
      throw new ReglaNegocioException(
        'La bodega central no recibe traslados: se abastece con compras a proveedores',
      );
    }

    // RN-10: el traslado es de reabastecimiento o está vinculado a un pedido de cliente.
    if (dto.motivo === MotivoTraslado.PEDIDO_CLIENTE && !dto.pedidoId) {
      throw new ReglaNegocioException('Un traslado por pedido de cliente debe indicar el pedido');
    }
    if (dto.motivo === MotivoTraslado.REABASTECIMIENTO && dto.pedidoId) {
      throw new ReglaNegocioException(
        'Solo los traslados por pedido de cliente se vinculan a un pedido',
      );
    }
    if (dto.pedidoId && !(await tx.pedido.findUnique({ where: { id: dto.pedidoId } }))) {
      throw new ReglaNegocioException('El pedido indicado no existe');
    }

    const productos = await tx.producto.findMany({
      where: { id: { in: dto.detalles.map((d) => d.productoId) } },
      select: { id: true, nombre: true, activo: true },
    });
    const errores: string[] = [];
    const vistos = new Set<string>();
    dto.detalles.forEach((d, i) => {
      const producto = productos.find((p) => p.id === d.productoId);
      if (!producto) {
        errores.push(`Fila ${i + 1}: el producto no existe`);
        return;
      }
      if (!producto.activo) {
        errores.push(`Fila ${i + 1}: ${producto.nombre} está desactivado`);
      }
      if (vistos.has(d.productoId)) {
        errores.push(
          `Fila ${i + 1}: ${producto.nombre} está repetido; sume las cantidades en una sola fila`,
        );
      }
      vistos.add(d.productoId);
    });
    if (errores.length > 0) {
      throw new ReglaNegocioException('Revise los productos del traslado', errores);
    }

    const traslado = await tx.traslado.create({
      data: {
        origenId: dto.origenId,
        destinoId: dto.destinoId,
        motivo: dto.motivo,
        pedidoId: dto.pedidoId,
        observaciones: dto.observaciones || null,
        solicitadoPorId: usuario.id,
        detalles: {
          create: dto.detalles.map((d) => ({
            productoId: d.productoId,
            cantidadSolicitada: d.cantidad,
          })),
        },
      },
    });
    return traslado.id;
  }

  async aprobarEn(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    const traslado = await this.cabecera(tx, id);
    verificarAccion('aprobar', traslado, usuario);
    await this.transicionar(tx, traslado, 'aprobar', {
      aprobadoPorId: usuario.id,
      fechaAprobacion: new Date(),
    });
  }

  /**
   * Despacha (RN-09): descuenta del origen por FEFO, sin lotes vencidos, y registra un
   * TRASLADO_SALIDA por lote. Cada producto queda repartido en una fila por lote asignado.
   */
  async despacharEn(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    const traslado = await this.cabecera(tx, id);
    verificarAccion('despachar', traslado, usuario);
    const detalles = await tx.detalleTraslado.findMany({
      where: { trasladoId: id },
      include: { producto: { select: { nombre: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Se revisan todos los productos antes de descontar, para informar todos los faltantes juntos.
    const vigente = await this.motor.vigentePorProducto(
      tx,
      traslado.origenId,
      detalles.map((d) => d.productoId),
    );
    const faltantes = detalles
      .filter((d) => (vigente.get(d.productoId) ?? 0) < d.cantidadSolicitada)
      .map((d) => {
        const hay = vigente.get(d.productoId) ?? 0;
        return `${d.producto.nombre}: se solicitaron ${d.cantidadSolicitada} y hay ${hay} ${hay === 1 ? 'unidad vigente' : 'unidades vigentes'}`;
      });
    if (faltantes.length > 0) {
      throw new ReglaNegocioException(
        `${traslado.origen.nombre} no tiene existencia vigente suficiente para despachar el traslado #${traslado.numero}`,
        faltantes,
      );
    }

    await this.transicionar(tx, traslado, 'despachar', {
      despachadoPorId: usuario.id,
      fechaDespacho: new Date(),
    });
    for (const d of detalles) {
      const asignados = await this.motor.descontarFefo(tx, {
        ubicacionId: traslado.origenId,
        productoId: d.productoId,
        cantidad: d.cantidadSolicitada,
        tipo: TipoMovimientoInventario.TRASLADO_SALIDA,
        referenciaTipo: REFERENCIA,
        referenciaId: traslado.id,
        motivo: `Traslado #${traslado.numero} hacia ${traslado.destino.nombre}`,
        usuarioId: usuario.id,
      });
      const [primero, ...resto] = asignados;
      await tx.detalleTraslado.update({
        where: { id: d.id },
        data: {
          loteId: primero.loteId,
          cantidadSolicitada: primero.cantidad,
          cantidadEnviada: primero.cantidad,
        },
      });
      for (const a of resto) {
        await tx.detalleTraslado.create({
          data: {
            trasladoId: traslado.id,
            productoId: d.productoId,
            loteId: a.loteId,
            cantidadSolicitada: a.cantidad,
            cantidadEnviada: a.cantidad,
          },
        });
      }
    }
  }

  /**
   * Recibe (RN-09): suma en el destino lo despachado, con el mismo lote, como TRASLADO_ENTRADA.
   * Si llegó menos, el faltante se registra después como AJUSTE negativo con el motivo, para que
   * el kardex muestre lo enviado y la diferencia por separado.
   */
  async recibirEn(tx: Tx, id: string, dto: RecibirTrasladoDto, usuario: UsuarioAutenticado) {
    const traslado = await this.cabecera(tx, id);
    verificarAccion('recibir', traslado, usuario);
    const detalles = await tx.detalleTraslado.findMany({
      where: { trasladoId: id },
      include: {
        producto: { select: { nombre: true } },
        lote: { select: { numeroLote: true } },
      },
    });
    const diferencias = validarRecepcion(
      detalles.map((d) => ({
        id: d.id,
        cantidadEnviada: d.cantidadEnviada ?? 0,
        producto: d.producto.nombre,
        numeroLote: d.lote?.numeroLote ?? '',
      })),
      dto.detalles,
      dto.motivoDiferencia,
    );

    await this.transicionar(tx, traslado, 'recibir', {
      recibidoPorId: usuario.id,
      fechaRecepcion: new Date(),
    });
    const contexto = {
      ubicacionId: traslado.destinoId,
      referenciaTipo: REFERENCIA,
      referenciaId: traslado.id,
      usuarioId: usuario.id,
    };
    for (const d of detalles) {
      const recibida = dto.detalles.find((r) => r.detalleId === d.id)!.cantidadRecibida;
      await tx.detalleTraslado.update({
        where: { id: d.id },
        data: { cantidadRecibida: recibida },
      });
      if (!d.loteId || !d.cantidadEnviada) {
        continue;
      }
      await this.motor.ingresar(tx, {
        ...contexto,
        loteId: d.loteId,
        cantidad: d.cantidadEnviada,
        tipo: TipoMovimientoInventario.TRASLADO_ENTRADA,
        motivo: `Traslado #${traslado.numero} desde ${traslado.origen.nombre}`,
      });
      const diferencia = diferencias.find((x) => x.detalleId === d.id);
      if (diferencia) {
        await this.motor.descontarLote(tx, {
          ...contexto,
          loteId: d.loteId,
          cantidad: diferencia.faltante,
          tipo: TipoMovimientoInventario.AJUSTE,
          // Si el lote venció durante el viaje, la diferencia igual debe registrarse.
          permitirVencido: true,
          motivo: `Diferencia al recibir el traslado #${traslado.numero}: ${dto.motivoDiferencia!.trim()}`,
        });
      }
    }
  }

  /** Cancela un traslado que aún no salió del origen; no mueve inventario (RN-08). */
  async cancelarEn(tx: Tx, id: string, dto: CancelarTrasladoDto, usuario: UsuarioAutenticado) {
    const traslado = await this.cabecera(tx, id);
    verificarAccion('cancelar', traslado, usuario);
    await this.transicionar(tx, traslado, 'cancelar', {
      canceladoPorId: usuario.id,
      fechaCancelacion: new Date(),
      motivoCancelacion: dto.motivo,
    });
  }

  private async cabecera(tx: Tx, id: string): Promise<Cabecera> {
    const traslado = await tx.traslado.findUnique({
      where: { id },
      include: { origen: { select: { nombre: true } }, destino: { select: { nombre: true } } },
    });
    if (!traslado) {
      throw new NotFoundException('El traslado no existe');
    }
    return traslado;
  }

  /**
   * Cambia el estado solo si sigue siendo uno de los previos permitidos. Si otra petición lo
   * cambió entre la lectura y la escritura (por ejemplo, dos despachos simultáneos), no se
   * actualiza nada y se informa el estado actual.
   */
  private async transicionar(
    tx: Tx,
    traslado: Cabecera,
    accion: AccionTraslado,
    datos: Prisma.TrasladoUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.traslado.updateMany({
      where: { id: traslado.id, estado: { in: [...ESTADOS_PREVIOS[accion]] } },
      data: { ...datos, estado: ESTADO_RESULTANTE[accion] },
    });
    if (count === 0) {
      const actual = await tx.traslado.findUniqueOrThrow({ where: { id: traslado.id } });
      verificarEstado(accion, actual);
      throw new ReglaNegocioException(
        'El traslado cambió mientras se procesaba. Intente de nuevo.',
      );
    }
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  /** Listado con filtros por estado, ubicación y fechas (RF-13). GERENTE ve solo los suyos. */
  async listar(filtro: FiltroTrasladosDto, usuario: UsuarioAutenticado) {
    const ubicacionId = esRolGlobal(usuario.rol) ? filtro.ubicacionId : usuario.ubicacionId!;
    const porUbicacion: Prisma.TrasladoWhereInput = !ubicacionId
      ? {}
      : filtro.direccion === 'ENTRANTE'
        ? { destinoId: ubicacionId }
        : filtro.direccion === 'SALIENTE'
          ? { origenId: ubicacionId }
          : { OR: [{ origenId: ubicacionId }, { destinoId: ubicacionId }] };
    const q = filtro.q?.trim().replace(/^#/, '');
    const porTexto: Prisma.TrasladoWhereInput = !q
      ? {}
      : /^\d+$/.test(q)
        ? { numero: Number(q) }
        : {
            detalles: {
              some: {
                producto: {
                  OR: [
                    { nombre: { contains: q, mode: 'insensitive' } },
                    { sku: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          };
    const where: Prisma.TrasladoWhereInput = {
      AND: [
        porUbicacion,
        porTexto,
        {
          ...(filtro.estado && { estado: filtro.estado }),
          ...((filtro.desde || filtro.hasta) && {
            fechaSolicitud: {
              ...(filtro.desde && { gte: new Date(filtro.desde) }),
              ...(filtro.hasta && { lt: sumarDias(new Date(filtro.hasta), 1) }),
            },
          }),
        },
      ],
    };
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.traslado.findMany({
        where,
        include: {
          origen: ubicacionResumen,
          destino: ubicacionResumen,
          solicitadoPor: usuarioResumen,
          detalles: { select: { productoId: true, cantidadSolicitada: true } },
        },
        orderBy: [{ fechaSolicitud: 'desc' }, { numero: 'desc' }],
        ...saltar(filtro),
      }),
      this.prisma.traslado.count({ where }),
    ]);
    const data = filas.map(({ detalles, ...t }) => ({
      ...t,
      productos: new Set(detalles.map((d) => d.productoId)).size,
      unidades: detalles.reduce((s, d) => s + d.cantidadSolicitada, 0),
    }));
    return pagina(data, total, filtro);
  }

  /**
   * Detalle con historial de estados, acciones disponibles para el usuario y, mientras no se
   * despacha, la existencia vigente del origen para cada producto.
   */
  async obtener(id: string, usuario: UsuarioAutenticado) {
    const traslado = await this.prisma.traslado.findUnique({
      where: { id },
      include: {
        origen: ubicacionResumen,
        destino: ubicacionResumen,
        solicitadoPor: usuarioResumen,
        aprobadoPor: usuarioResumen,
        despachadoPor: usuarioResumen,
        recibidoPor: usuarioResumen,
        canceladoPor: usuarioResumen,
        pedido: { select: { id: true, numero: true } },
        detalles: {
          include: {
            producto: { select: { id: true, sku: true, nombre: true, presentacion: true } },
            lote: { select: { id: true, numeroLote: true, fechaVencimiento: true } },
          },
        },
      },
    });
    if (!traslado) {
      throw new NotFoundException('El traslado no existe');
    }
    // Un gerente ve los traslados que salen de su ubicación o llegan a ella.
    if (
      !esRolGlobal(usuario.rol) &&
      ![traslado.origenId, traslado.destinoId].includes(usuario.ubicacionId!)
    ) {
      throw new ForbiddenException('Solo puede acceder a los datos de su ubicación');
    }

    const pendiente =
      traslado.estado === EstadoTraslado.SOLICITADO || traslado.estado === EstadoTraslado.APROBADO;
    const vigente = pendiente
      ? await this.motor.vigentePorProducto(
          this.prisma,
          traslado.origenId,
          traslado.detalles.map((d) => d.productoId),
        )
      : null;

    const detalles = [...traslado.detalles]
      .sort(
        (a, b) =>
          a.producto.nombre.localeCompare(b.producto.nombre, 'es') ||
          (a.lote?.fechaVencimiento.getTime() ?? 0) - (b.lote?.fechaVencimiento.getTime() ?? 0),
      )
      .map((d) => ({
        ...d,
        ...(vigente && { disponibleOrigen: vigente.get(d.productoId) ?? 0 }),
      }));

    const historial = [
      {
        estado: EstadoTraslado.SOLICITADO,
        fecha: traslado.fechaSolicitud,
        usuario: traslado.solicitadoPor,
      },
      {
        estado: EstadoTraslado.APROBADO,
        fecha: traslado.fechaAprobacion,
        usuario: traslado.aprobadoPor,
      },
      {
        estado: EstadoTraslado.EN_TRANSITO,
        fecha: traslado.fechaDespacho,
        usuario: traslado.despachadoPor,
      },
      {
        estado: EstadoTraslado.RECIBIDO,
        fecha: traslado.fechaRecepcion,
        usuario: traslado.recibidoPor,
      },
      {
        estado: EstadoTraslado.CANCELADO,
        fecha: traslado.fechaCancelacion,
        usuario: traslado.canceladoPor,
      },
    ].filter((h) => h.fecha !== null);

    return {
      ...traslado,
      detalles,
      historial,
      acciones: accionesDisponibles(traslado, usuario),
    };
  }
}
