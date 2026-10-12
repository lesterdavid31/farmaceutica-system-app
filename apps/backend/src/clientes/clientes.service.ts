import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ReglaNegocioException } from '../common/errores';
import { pagina, saltar } from '../common/paginacion';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarNit } from '../ventas/reglas-venta';
import {
  ActualizarClienteDto,
  ActualizarDireccionDto,
  CrearClienteDto,
  DireccionDto,
  FiltroClientesDto,
} from './clientes.dto';

/** Clientes del call center con sus direcciones de entrega (RF-20). */
@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca por teléfono, nombre o NIT. El operador normalmente busca por teléfono (RF-21). */
  async listar(filtro: FiltroClientesDto) {
    const q = filtro.q?.trim();
    const digitos = q?.replace(/[\s-]/g, '');
    const where: Prisma.ClienteWhereInput = {
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(q && {
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          ...(digitos && /^\d+$/.test(digitos) ? [{ telefono: { contains: digitos } }] : []),
          { nit: { contains: q.replace(/[\s-]/g, '').toUpperCase() } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        include: {
          direcciones: {
            where: { activa: true },
            orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }],
          },
          _count: { select: { pedidos: true } },
        },
        orderBy: { nombre: 'asc' },
        ...saltar(filtro),
      }),
      this.prisma.cliente.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        direcciones: {
          include: { municipio: { select: { id: true, nombre: true } } },
          orderBy: [{ activa: 'desc' }, { principal: 'desc' }, { createdAt: 'asc' }],
        },
        pedidos: {
          select: {
            id: true,
            numero: true,
            estado: true,
            total: true,
            fechaCompromiso: true,
            createdAt: true,
            ubicacionDespacho: { select: { nombre: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!cliente) {
      throw new NotFoundException('El cliente no existe');
    }
    return cliente;
  }

  async crear(dto: CrearClienteDto) {
    await this.verificarTelefono(dto.telefono);
    const cliente = await this.prisma.cliente.create({
      data: { ...dto, nit: this.nit(dto.nit) },
    });
    return this.obtener(cliente.id);
  }

  async actualizar(id: string, dto: ActualizarClienteDto) {
    await this.obtener(id);
    if (dto.telefono) {
      await this.verificarTelefono(dto.telefono, id);
    }
    await this.prisma.cliente.update({
      where: { id },
      data: { ...dto, ...(dto.nit !== undefined && { nit: this.nit(dto.nit) }) },
    });
    return this.obtener(id);
  }

  async agregarDireccion(clienteId: string, dto: DireccionDto) {
    const cliente = await this.obtener(clienteId);
    await this.verificarMunicipio(dto.municipioId);
    // La primera dirección activa es la principal.
    const principal = dto.principal ?? !cliente.direcciones.some((d) => d.activa);
    await this.prisma.$transaction(async (tx) => {
      if (principal) {
        await tx.direccionCliente.updateMany({ where: { clienteId }, data: { principal: false } });
      }
      await tx.direccionCliente.create({ data: { ...dto, clienteId, principal } });
    });
    return this.obtener(clienteId);
  }

  async actualizarDireccion(clienteId: string, direccionId: string, dto: ActualizarDireccionDto) {
    const direccion = await this.prisma.direccionCliente.findFirst({
      where: { id: direccionId, clienteId },
    });
    if (!direccion) {
      throw new NotFoundException('La dirección no existe');
    }
    await this.verificarMunicipio(dto.municipioId);
    await this.prisma.$transaction(async (tx) => {
      if (dto.principal) {
        await tx.direccionCliente.updateMany({ where: { clienteId }, data: { principal: false } });
      }
      await tx.direccionCliente.update({
        where: { id: direccionId },
        // Una dirección desactivada deja de ser la principal.
        data: { ...dto, ...(dto.activa === false && { principal: false }) },
      });
    });
    return this.obtener(clienteId);
  }

  private nit(nit?: string) {
    return nit ? normalizarNit(nit) : null;
  }

  private async verificarTelefono(telefono: string, excepto?: string) {
    const otro = await this.prisma.cliente.findFirst({
      where: { telefono, activo: true, ...(excepto && { id: { not: excepto } }) },
    });
    if (otro) {
      throw new ReglaNegocioException(
        `El teléfono ${telefono} ya está registrado para ${otro.nombre}`,
      );
    }
  }

  private async verificarMunicipio(municipioId?: string) {
    if (municipioId && !(await this.prisma.municipio.findUnique({ where: { id: municipioId } }))) {
      throw new ReglaNegocioException('El municipio no existe');
    }
  }
}
