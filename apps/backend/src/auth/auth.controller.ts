import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { SinBitacora } from '../bitacora/auditar.decorator';
import { ipDe } from '../bitacora/bitacora.interceptor';
import { Publico, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { LoginDto, PerfilDto, RespuestaLoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Publico()
  @SinBitacora()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña (RF-01)' })
  @ApiOkResponse({ type: RespuestaLoginDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas o usuario desactivado' })
  @ApiTooManyRequestsResponse({ description: 'Más de 5 intentos por minuto desde la misma IP' })
  login(@Body() dto: LoginDto, @Req() peticion: Request) {
    return this.auth.login(dto.email, dto.password, ipDe(peticion));
  }

  @Get('perfil')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiOkResponse({ type: PerfilDto })
  perfil(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.auth.perfil(usuario.id);
  }
}
