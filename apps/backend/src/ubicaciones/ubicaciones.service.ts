import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { pagina, saltar } from '../common/paginacion';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActualizarUbicacionDto,
  CrearMunicipioDto,
  CrearUbicacionDto,
  FiltroUbicacionesDto,
} from './ubicaciones.dto';

const INCLUIR_MUNICIPIO = {
  municipio: {
    select: { id: true, nombre: true, departamento: { select: { id: true, nombre: true } } },
  },
} as const;

@Injectable()
export class UbicacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroUbicacionesDto) {
    const where: Prisma.UbicacionWhereInput = {
      ...(filtro.tipo && { tipo: filtro.tipo }),
      ...(filtro.activa !== undefined && { activa: filtro.activa }),
      ...(filtro.q && {
        OR: [
          { nombre: { contains: filtro.q, mode: 'insensitive' } },
          { codigo: { contains: filtro.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ubicacion.findMany({
        where,
        include: INCLUIR_MUNICIPIO,
        orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
        ...saltar(filtro),
      }),
      this.prisma.ubicacion.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string) {
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id },
      include: INCLUIR_MUNICIPIO,
    });
    if (!ubicacion) {
      throw new NotFoundException('La ubicación no existe');
    }
    return ubicacion;
  }

  crear(dto: CrearUbicacionDto) {
    return this.prisma.ubicacion.create({ data: dto, include: INCLUIR_MUNICIPIO });
  }

  async actualizar(id: string, dto: ActualizarUbicacionDto) {
    await this.obtener(id);
    return this.prisma.ubicacion.update({ where: { id }, data: dto, include: INCLUIR_MUNICIPIO });
  }

  /** Las ubicaciones no se borran: tienen historial de inventario, caja y ventas. */
  async desactivar(id: string) {
    await this.obtener(id);
    return this.prisma.ubicacion.update({
      where: { id },
      data: { activa: false },
      include: INCLUIR_MUNICIPIO,
    });
  }

  departamentos() {
    return this.prisma.departamento.findMany({
      orderBy: { codigo: 'asc' },
      include: { municipios: { orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } } },
    });
  }

  crearMunicipio(dto: CrearMunicipioDto) {
    return this.prisma.municipio.create({ data: dto });
  }
}
