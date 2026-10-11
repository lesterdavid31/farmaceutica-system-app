import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface PayloadJwt {
  sub: string;
  rol: Rol;
  ubicacionId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Se consulta el usuario en cada petición: si fue desactivado o cambió de rol o de ubicación,
   * el cambio aplica de inmediato aunque su token siga vigente.
   */
  async validate(payload: PayloadJwt): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, nombre: true, email: true, rol: true, ubicacionId: true, activo: true },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Su sesión ya no es válida. Inicie sesión de nuevo.');
    }
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      ubicacionId: usuario.ubicacionId,
    };
  }
}
