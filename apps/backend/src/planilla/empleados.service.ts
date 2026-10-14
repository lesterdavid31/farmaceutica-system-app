import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { Rol } from '../generated/prisma/enums';
import { resolverUbicacion, verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { pagina, saltar } from '../common/paginacion';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { hoyGuatemala } from '../inventario/fefo';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarEmpleadoDto, CrearEmpleadoDto, FiltroEmpleadosDto } from './planilla.dto';

const fechaDe = (texto: string) => new Date(`${texto.slice(0, 10)}T00:00:00.000Z`);

const incluir = {
  ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
  usuario: { select: { id: true, nombre: true, email: true, rol: true } },
} as const;

/** Empleados (RF-26). El gerente gestiona los de su sucursal; el administrador, todos. */
@Injectable()
export class EmpleadosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroEmpleadosDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId);
    const q = filtro.q?.trim();
    const where: Prisma.EmpleadoWhereInput = {
      ...(ubicacionId && { ubicacionId }),
      ...(filtro.puesto && { puesto: filtro.puesto }),
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(q && {
        OR: [
          { nombres: { contains: q, mode: 'insensitive' } },
          { apellidos: { contains: q, mode: 'insensitive' } },
          { dpi: { contains: q.replace(/\s/g, '') } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.empleado.findMany({
        where,
        include: incluir,
        orderBy: [{ activo: 'desc' }, { apellidos: 'asc' }, { nombres: 'asc' }],
        ...saltar(filtro),
      }),
      this.prisma.empleado.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id }, include: incluir });
    if (!empleado) {
      throw new NotFoundException('El empleado no existe');
    }
    verificarAccesoUbicacion(usuario, empleado.ubicacionId);
    return empleado;
  }

  async crear(dto: CrearEmpleadoDto, usuario: UsuarioAutenticado) {
    verificarAccesoUbicacion(usuario, dto.ubicacionId);
    await this.validar(dto);
    const empleado = await this.guardar(() =>
      this.prisma.empleado.create({
        data: { ...dto, fechaIngreso: fechaDe(dto.fechaIngreso), usuarioId: dto.usuarioId ?? null },
      }),
    );
    return this.obtener(empleado.id, usuario);
  }

  async actualizar(id: string, dto: ActualizarEmpleadoDto, usuario: UsuarioAutenticado) {
    const actual = await this.obtener(id, usuario);
    if (dto.ubicacionId && dto.ubicacionId !== actual.ubicacionId && usuario.rol !== Rol.ADMIN) {
      throw new ForbiddenException('Solo el administrador traslada empleados a otra ubicación');
    }
    await this.validar({ ...dto, ubicacionId: dto.ubicacionId ?? actual.ubicacionId }, id);
    await this.guardar(() =>
      this.prisma.empleado.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.fechaIngreso && { fechaIngreso: fechaDe(dto.fechaIngreso) }),
        },
      }),
    );
    return this.obtener(id, usuario);
  }

  async desactivar(id: string, usuario: UsuarioAutenticado) {
    await this.obtener(id, usuario);
    await this.prisma.empleado.update({ where: { id }, data: { activo: false } });
    return this.obtener(id, usuario);
  }

  private async validar(dto: Partial<CrearEmpleadoDto>, excepto?: string) {
    if (dto.ubicacionId) {
      const ubicacion = await this.prisma.ubicacion.findUnique({ where: { id: dto.ubicacionId } });
      if (!ubicacion?.activa) {
        throw new ReglaNegocioException('La ubicación no existe o está desactivada');
      }
    }
    if (dto.fechaIngreso && fechaDe(dto.fechaIngreso) > hoyGuatemala()) {
      throw new ReglaNegocioException('La fecha de ingreso no puede ser futura');
    }
    if (dto.usuarioId) {
      const u = await this.prisma.usuario.findUnique({
        where: { id: dto.usuarioId },
        include: { empleado: { select: { id: true } } },
      });
      if (!u) {
        throw new ReglaNegocioException('El usuario no existe');
      }
      if (u.empleado && u.empleado.id !== excepto) {
        throw new ReglaNegocioException('El usuario ya está vinculado a otro empleado');
      }
      if (u.ubicacionId && dto.ubicacionId && u.ubicacionId !== dto.ubicacionId) {
        throw new ReglaNegocioException(
          'El usuario pertenece a otra ubicación que la del empleado',
        );
      }
    }
  }

  /** El DPI es único: un duplicado se informa con un mensaje claro. */
  private async guardar<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un empleado con ese DPI');
      }
      throw error;
    }
  }
}
