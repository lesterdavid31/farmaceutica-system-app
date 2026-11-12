import { Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Prisma } from '../generated/prisma/client';
import { ReglaNegocioException } from '../common/errores';
import { pagina, saltar } from '../common/paginacion';
import { PrismaService } from '../prisma/prisma.service';
import { Rol } from '../generated/prisma/enums';
import { ROLES_SOLICITABLES } from './reglas-solicitud';
import { validarRolUbicacion } from './reglas-usuario';
import { ActualizarUsuarioDto, CrearUsuarioDto, FiltroUsuariosDto } from './usuarios.dto';

export const COSTO_BCRYPT = 10;

/** Nunca se devuelve password_hash. */
const SELECCION_USUARIO = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  ubicacionId: true,
  ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UsuarioSelect;

/**
 * Las cuentas de gerente y cajero solo nacen de una solicitud aprobada por el gerente general
 * (separación de funciones); TI no las crea por su cuenta.
 */
function exigirSolicitudParaSucursal(rol: Rol) {
  if ((ROLES_SOLICITABLES as readonly Rol[]).includes(rol)) {
    throw new ReglaNegocioException(
      'Las cuentas de gerente y cajero se crean desde una solicitud aprobada por el gerente general',
    );
  }
}

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroUsuariosDto) {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.rol && { rol: filtro.rol }),
      ...(filtro.ubicacionId && { ubicacionId: filtro.ubicacionId }),
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(filtro.q && {
        OR: [
          { nombre: { contains: filtro.q, mode: 'insensitive' } },
          { email: { contains: filtro.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        select: SELECCION_USUARIO,
        orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
        ...saltar(filtro),
      }),
      this.prisma.usuario.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECCION_USUARIO,
    });
    if (!usuario) {
      throw new NotFoundException('El usuario no existe');
    }
    return usuario;
  }

  async crear(dto: CrearUsuarioDto) {
    exigirSolicitudParaSucursal(dto.rol);
    const ubicacionId = dto.ubicacionId ?? null;
    validarRolUbicacion(dto.rol, await this.ubicacionDe(ubicacionId));
    const { password, ...datos } = dto;
    return this.prisma.usuario.create({
      data: { ...datos, ubicacionId, passwordHash: await hash(password, COSTO_BCRYPT) },
      select: SELECCION_USUARIO,
    });
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, actorId: string) {
    const actual = await this.obtener(id);
    const rol = dto.rol ?? actual.rol;
    if (rol !== actual.rol) {
      exigirSolicitudParaSucursal(rol);
    }
    const ubicacionId = dto.ubicacionId !== undefined ? dto.ubicacionId : actual.ubicacionId;
    validarRolUbicacion(rol, await this.ubicacionDe(ubicacionId));

    if (id === actorId && (dto.activo === false || (dto.rol && dto.rol !== actual.rol))) {
      throw new ReglaNegocioException(
        'No puede desactivar su propio usuario ni cambiar su propio rol',
      );
    }
    const { password, ...datos } = dto;
    return this.prisma.usuario.update({
      where: { id },
      data: {
        ...datos,
        ubicacionId,
        ...(password && { passwordHash: await hash(password, COSTO_BCRYPT) }),
      },
      select: SELECCION_USUARIO,
    });
  }

  /** Los usuarios no se borran: sus acciones quedan en la bitácora y el kardex. */
  async desactivar(id: string, actorId: string) {
    if (id === actorId) {
      throw new ReglaNegocioException('No puede desactivar su propio usuario');
    }
    await this.obtener(id);
    return this.prisma.usuario.update({
      where: { id },
      data: { activo: false },
      select: SELECCION_USUARIO,
    });
  }

  private async ubicacionDe(ubicacionId: string | null) {
    if (!ubicacionId) {
      return null;
    }
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: ubicacionId },
      select: { tipo: true, activa: true },
    });
    if (!ubicacion) {
      throw new ReglaNegocioException('La ubicación seleccionada no existe');
    }
    return ubicacion;
  }
}
