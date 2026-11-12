import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { resolverUbicacion, verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { pagina, saltar } from '../common/paginacion';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Prisma } from '../generated/prisma/client';
import { EstadoSolicitudUsuario } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  accionesDisponibles,
  estadoInicial,
  MENSAJE_ESTADO,
  motivoNoPuedeSolicitar,
  puedeHacer,
  type AccionSolicitud,
} from './reglas-solicitud';
import { validarRolUbicacion } from './reglas-usuario';
import {
  CrearCuentaDto,
  CrearSolicitudUsuarioDto,
  FiltroSolicitudesDto,
  RechazarSolicitudDto,
} from './solicitudes.dto';
import { COSTO_BCRYPT } from './usuarios.service';

const persona = { select: { id: true, nombre: true, email: true } } as const;

const incluir = {
  ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
  solicitadoPor: persona,
  revisadoPor: persona,
  atendidoPor: persona,
  usuario: persona,
} as const;

/** Solicitudes de cuenta: el gerente pide, el gerente general aprueba y TI crea la cuenta. */
@Injectable()
export class SolicitudesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroSolicitudesDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId);
    const q = filtro.q?.trim();
    const where: Prisma.SolicitudUsuarioWhereInput = {
      ...(ubicacionId && { ubicacionId }),
      ...(filtro.estado && { estado: filtro.estado }),
      ...(q && {
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.solicitudUsuario.findMany({
        where,
        include: incluir,
        orderBy: { createdAt: 'desc' },
        ...saltar(filtro),
      }),
      this.prisma.solicitudUsuario.count({ where }),
    ]);
    const data = filas.map((s) => ({ ...s, acciones: accionesDisponibles(s, usuario) }));
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const solicitud = await this.prisma.solicitudUsuario.findUnique({
      where: { id },
      include: incluir,
    });
    if (!solicitud) {
      throw new NotFoundException('La solicitud no existe');
    }
    verificarAccesoUbicacion(usuario, solicitud.ubicacionId);
    return { ...solicitud, acciones: accionesDisponibles(solicitud, usuario) };
  }

  async crear(dto: CrearSolicitudUsuarioDto, usuario: UsuarioAutenticado) {
    const motivo = motivoNoPuedeSolicitar(usuario, dto.ubicacionId);
    if (motivo) {
      throw new ForbiddenException(motivo);
    }
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: dto.ubicacionId },
      select: { tipo: true, activa: true },
    });
    if (!ubicacion) {
      throw new ReglaNegocioException('La ubicación seleccionada no existe');
    }
    validarRolUbicacion(dto.rol, ubicacion);
    await this.verificarCorreoLibre(dto.email);

    const estado = estadoInicial(usuario);
    const aprobada = estado === EstadoSolicitudUsuario.APROBADA;
    const solicitud = await this.correoUnico(() =>
      this.prisma.solicitudUsuario.create({
        data: {
          ...dto,
          estado,
          solicitadoPorId: usuario.id,
          ...(aprobada && { revisadoPorId: usuario.id, fechaRevision: new Date() }),
        },
      }),
    );
    return this.obtener(solicitud.id, usuario);
  }

  async aprobar(id: string, usuario: UsuarioAutenticado) {
    await this.exigir('aprobar', id, usuario);
    await this.cambiarEstado(id, EstadoSolicitudUsuario.PENDIENTE, 'aprobar', {
      estado: EstadoSolicitudUsuario.APROBADA,
      revisadoPorId: usuario.id,
      fechaRevision: new Date(),
    });
    return this.obtener(id, usuario);
  }

  async rechazar(id: string, dto: RechazarSolicitudDto, usuario: UsuarioAutenticado) {
    await this.exigir('rechazar', id, usuario);
    await this.cambiarEstado(id, EstadoSolicitudUsuario.PENDIENTE, 'rechazar', {
      estado: EstadoSolicitudUsuario.RECHAZADA,
      revisadoPorId: usuario.id,
      fechaRevision: new Date(),
      motivoRechazo: dto.motivo,
    });
    return this.obtener(id, usuario);
  }

  /** TI crea la cuenta con los datos aprobados; solo define la contraseña inicial. */
  async crearCuenta(id: string, dto: CrearCuentaDto, usuario: UsuarioAutenticado) {
    const solicitud = await this.exigir('crearCuenta', id, usuario);
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: solicitud.ubicacionId },
      select: { tipo: true, activa: true },
    });
    validarRolUbicacion(solicitud.rol, ubicacion);
    const passwordHash = await hash(dto.password, COSTO_BCRYPT);

    await this.correoUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const nuevo = await tx.usuario.create({
          data: {
            nombre: solicitud.nombre,
            email: solicitud.email,
            rol: solicitud.rol,
            ubicacionId: solicitud.ubicacionId,
            passwordHash,
          },
        });
        const { count } = await tx.solicitudUsuario.updateMany({
          where: { id, estado: EstadoSolicitudUsuario.APROBADA },
          data: {
            estado: EstadoSolicitudUsuario.ATENDIDA,
            atendidoPorId: usuario.id,
            fechaAtencion: new Date(),
            usuarioId: nuevo.id,
          },
        });
        if (count === 0) {
          throw new ReglaNegocioException(MENSAJE_ESTADO.crearCuenta);
        }
      }),
    );
    return this.obtener(id, usuario);
  }

  private async exigir(accion: AccionSolicitud, id: string, usuario: UsuarioAutenticado) {
    const solicitud = await this.obtener(id, usuario);
    if (!puedeHacer(accion, usuario, solicitud)) {
      throw new ReglaNegocioException(MENSAJE_ESTADO[accion]);
    }
    return solicitud;
  }

  /** Cambio condicionado al estado: si otro usuario se adelantó, no se aplica. */
  private async cambiarEstado(
    id: string,
    desde: EstadoSolicitudUsuario,
    accion: AccionSolicitud,
    data: Prisma.SolicitudUsuarioUncheckedUpdateManyInput,
  ) {
    const { count } = await this.prisma.solicitudUsuario.updateMany({
      where: { id, estado: desde },
      data,
    });
    if (count === 0) {
      throw new ReglaNegocioException(MENSAJE_ESTADO[accion]);
    }
  }

  private async verificarCorreoLibre(email: string) {
    const [usuario, enCurso] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.solicitudUsuario.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          estado: { in: [EstadoSolicitudUsuario.PENDIENTE, EstadoSolicitudUsuario.APROBADA] },
        },
        select: { numero: true },
      }),
    ]);
    if (usuario) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }
    if (enCurso) {
      throw new ConflictException(`Ese correo ya tiene la solicitud #${enCurso.numero} en curso`);
    }
  }

  /** Dos solicitudes simultáneas con el mismo correo chocan con los índices únicos. */
  private async correoUnico<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese correo ya está en uso o tiene una solicitud en curso');
      }
      throw error;
    }
  }
}
