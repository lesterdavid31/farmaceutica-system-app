import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { Rol, TipoMovimientoInventario, TipoUbicacion } from '../generated/prisma/enums';
import { verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { fechaCorta, OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { esRolGlobal, UsuarioAutenticado } from '../common/usuario-autenticado';
import { hoyGuatemala, sumarDias } from '../inventario/fefo';
import { MotorInventarioService } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import { CrearCompraDto, FiltroComprasDto } from './compras.dto';

const fechaDe = (texto: string) => new Date(`${texto.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorInventarioService,
  ) {}

  /** La bodega central es la única ubicación que compra a proveedores (sección 3.1). */
  private async bodegaDe(usuario: UsuarioAutenticado) {
    if (usuario.rol === Rol.GERENTE) {
      const ubicacion = await this.prisma.ubicacion.findUniqueOrThrow({
        where: { id: usuario.ubicacionId! },
      });
      if (ubicacion.tipo !== TipoUbicacion.BODEGA_CENTRAL) {
        throw new ReglaNegocioException(
          'Solo la bodega central registra compras a proveedores. Las sucursales se abastecen con traslados.',
        );
      }
      return ubicacion;
    }
    const bodega = await this.prisma.ubicacion.findFirst({
      where: { tipo: TipoUbicacion.BODEGA_CENTRAL, activa: true },
    });
    if (!bodega) {
      throw new ReglaNegocioException('No hay una bodega central activa');
    }
    return bodega;
  }

  /** Registra una compra en la bodega con lote, vencimiento y costo por producto (RF-04). */
  async crear(dto: CrearCompraDto, usuario: UsuarioAutenticado) {
    const bodega = await this.bodegaDe(usuario);
    const hoy = hoyGuatemala();
    const fecha = dto.fecha ? fechaDe(dto.fecha) : hoy;
    if (fecha > hoy) {
      throw new ReglaNegocioException('La fecha de la compra no puede ser futura');
    }
    if (fecha < sumarDias(hoy, -365)) {
      throw new ReglaNegocioException('La fecha de la compra no puede tener más de un año');
    }

    const proveedor = await this.prisma.proveedor.findUnique({ where: { id: dto.proveedorId } });
    if (!proveedor?.activo) {
      throw new ReglaNegocioException('El proveedor no existe o está desactivado');
    }

    const productoIds = [...new Set(dto.detalles.map((d) => d.productoId))];
    const productos = await this.prisma.producto.findMany({ where: { id: { in: productoIds } } });
    const errores: string[] = [];
    const vistos = new Set<string>();
    dto.detalles.forEach((d, i) => {
      const fila = `Fila ${i + 1}`;
      const producto = productos.find((p) => p.id === d.productoId);
      if (!producto) {
        errores.push(`${fila}: el producto no existe`);
        return;
      }
      if (!producto.activo) {
        errores.push(`${fila}: ${producto.nombre} está desactivado`);
      }
      const clave = `${d.productoId}|${d.numeroLote}`;
      if (vistos.has(clave)) {
        errores.push(
          `${fila}: el lote ${d.numeroLote} de ${producto.nombre} está repetido; sume las cantidades en una sola fila`,
        );
      }
      vistos.add(clave);
      if (fechaDe(d.fechaVencimiento) <= hoy) {
        errores.push(
          `${fila}: el lote ${d.numeroLote} de ${producto.nombre} ya está vencido o vence hoy`,
        );
      }
    });
    if (errores.length > 0) {
      throw new ReglaNegocioException('Revise los productos de la compra', errores);
    }

    const lotesExistentes = await this.prisma.lote.findMany({
      where: {
        OR: dto.detalles.map((d) => ({ productoId: d.productoId, numeroLote: d.numeroLote })),
      },
    });
    for (const lote of lotesExistentes) {
      const d = dto.detalles.find(
        (x) => x.productoId === lote.productoId && x.numeroLote === lote.numeroLote,
      )!;
      if (lote.fechaVencimiento.getTime() !== fechaDe(d.fechaVencimiento).getTime()) {
        const nombre = productos.find((p) => p.id === d.productoId)!.nombre;
        errores.push(
          `El lote ${d.numeroLote} de ${nombre} ya está registrado con vencimiento ${fechaCorta(lote.fechaVencimiento)}. Verifique el número de lote o la fecha.`,
        );
      }
    }
    if (errores.length > 0) {
      throw new ReglaNegocioException('Hay lotes que no coinciden con los ya registrados', errores);
    }

    const subtotales = dto.detalles.map((d) => new Prisma.Decimal(d.costoUnitario).mul(d.cantidad));
    const total = subtotales.reduce((s, x) => s.add(x), new Prisma.Decimal(0));

    const compraId = await this.prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          proveedorId: dto.proveedorId,
          ubicacionId: bodega.id,
          numeroDocumento: dto.numeroDocumento,
          fecha,
          total,
          observaciones: dto.observaciones,
          usuarioId: usuario.id,
        },
      });
      for (const [i, d] of dto.detalles.entries()) {
        const lote =
          lotesExistentes.find(
            (l) => l.productoId === d.productoId && l.numeroLote === d.numeroLote,
          ) ??
          (await tx.lote.create({
            data: {
              productoId: d.productoId,
              numeroLote: d.numeroLote,
              fechaVencimiento: fechaDe(d.fechaVencimiento),
              costoUnitario: d.costoUnitario,
              proveedorId: dto.proveedorId,
            },
          }));
        await tx.detalleCompra.create({
          data: {
            compraId: compra.id,
            productoId: d.productoId,
            loteId: lote.id,
            cantidad: d.cantidad,
            costoUnitario: d.costoUnitario,
            subtotal: subtotales[i],
          },
        });
        await this.motor.ingresar(tx, {
          ubicacionId: bodega.id,
          loteId: lote.id,
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
          tipo: TipoMovimientoInventario.COMPRA,
          referenciaTipo: 'COMPRA',
          referenciaId: compra.id,
          usuarioId: usuario.id,
        });
      }
      return compra.id;
    }, OPCIONES_TRANSACCION);

    return this.obtener(compraId, usuario);
  }

  async listar(filtro: FiltroComprasDto, usuario: UsuarioAutenticado) {
    const where: Prisma.CompraWhereInput = {
      ...(!esRolGlobal(usuario.rol) && { ubicacionId: usuario.ubicacionId! }),
      ...(filtro.proveedorId && { proveedorId: filtro.proveedorId }),
      ...(filtro.q && { numeroDocumento: { contains: filtro.q, mode: 'insensitive' } }),
      ...((filtro.desde || filtro.hasta) && {
        fecha: {
          ...(filtro.desde && { gte: fechaDe(filtro.desde) }),
          ...(filtro.hasta && { lte: fechaDe(filtro.hasta) }),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.compra.findMany({
        where,
        include: {
          proveedor: { select: { id: true, nombre: true } },
          usuario: { select: { nombre: true } },
          _count: { select: { detalles: true } },
        },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        ...saltar(filtro),
      }),
      this.prisma.compra.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const compra = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        proveedor: { select: { id: true, nombre: true, nit: true } },
        ubicacion: { select: { id: true, nombre: true } },
        usuario: { select: { nombre: true } },
        detalles: {
          include: {
            producto: { select: { id: true, sku: true, nombre: true, presentacion: true } },
            lote: { select: { id: true, numeroLote: true, fechaVencimiento: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!compra) {
      throw new NotFoundException('La compra no existe');
    }
    verificarAccesoUbicacion(usuario, compra.ubicacionId);
    return compra;
  }
}
