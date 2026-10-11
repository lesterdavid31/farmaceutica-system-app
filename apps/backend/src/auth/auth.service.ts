import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { BitacoraService } from '../bitacora/bitacora.service';
import { PrismaService } from '../prisma/prisma.service';
import { PerfilDto, RespuestaLoginDto } from './auth.dto';
import { PayloadJwt } from './jwt.strategy';

/**
 * Cuando el correo no existe se compara igual contra un hash ficticio, para que el tiempo de
 * respuesta no revele qué correos están registrados.
 */
let hashFicticio: string | undefined;
const HASH_FICTICIO = () => (hashFicticio ??= hashSync('usuario-inexistente', 10));

export const SELECCION_PERFIL = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly bitacora: BitacoraService,
  ) {}

  async login(email: string, password: string, ip: string | null): Promise<RespuestaLoginDto> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    const valida = await compare(password, usuario?.passwordHash ?? HASH_FICTICIO());

    if (!usuario || !valida || !usuario.activo) {
      await this.bitacora.registrarSinFallar({
        usuarioId: usuario?.id,
        accion: 'LOGIN_FALLIDO',
        entidad: 'Sesion',
        datosDespues: { email, motivo: usuario && valida ? 'usuario inactivo' : 'credenciales' },
        ip,
      });
      if (usuario && valida && !usuario.activo) {
        throw new UnauthorizedException('Su usuario está desactivado. Contacte al administrador.');
      }
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const payload: PayloadJwt = {
      sub: usuario.id,
      rol: usuario.rol,
      ubicacionId: usuario.ubicacionId,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const { exp, iat } = this.jwt.decode<{ exp: number; iat: number }>(accessToken);

    await this.bitacora.registrarSinFallar({
      usuarioId: usuario.id,
      accion: 'LOGIN',
      entidad: 'Sesion',
      entidadId: usuario.id,
      ip,
    });

    return { accessToken, expiraEn: exp - iat, usuario: await this.perfil(usuario.id) };
  }

  async perfil(id: string): Promise<PerfilDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECCION_PERFIL,
    });
    if (!usuario) {
      throw new NotFoundException('El usuario no existe');
    }
    return usuario;
  }
}
