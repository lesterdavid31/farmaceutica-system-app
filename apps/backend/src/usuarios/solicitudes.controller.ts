import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import {
  CrearCuentaDto,
  CrearSolicitudUsuarioDto,
  FiltroSolicitudesDto,
  RechazarSolicitudDto,
} from './solicitudes.dto';
import { SolicitudesService } from './solicitudes.service';

/** El gerente ve las de su ubicación; el gerente general, TI y el auditor, todas. */
@ApiTags('Solicitudes de usuario')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.GERENTE_GENERAL, Rol.GERENTE, Rol.AUDITOR)
@Controller('solicitudes-usuario')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitudes de cuenta' })
  listar(@Query() filtro: FiltroSolicitudesDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudes.listar(filtro, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con las acciones disponibles' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudes.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.GERENTE_GENERAL, Rol.GERENTE)
  @Auditar({ entidad: 'SolicitudUsuario', accion: 'SOLICITAR' })
  @ApiOperation({ summary: 'Solicitar una cuenta de gerente o cajero' })
  crear(@Body() dto: CrearSolicitudUsuarioDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudes.crear(dto, usuario);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @Roles(Rol.GERENTE_GENERAL)
  @Auditar({ entidad: 'SolicitudUsuario', modelo: 'solicitudUsuario', accion: 'APROBAR' })
  @ApiOperation({ summary: 'Aprobar una solicitud pendiente (gerente general)' })
  aprobar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudes.aprobar(id, usuario);
  }

  @Post(':id/rechazar')
  @HttpCode(200)
  @Roles(Rol.GERENTE_GENERAL)
  @Auditar({ entidad: 'SolicitudUsuario', modelo: 'solicitudUsuario', accion: 'RECHAZAR' })
  @ApiOperation({ summary: 'Rechazar una solicitud pendiente con motivo (gerente general)' })
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RechazarSolicitudDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.rechazar(id, dto, usuario);
  }

  @Post(':id/crear-cuenta')
  @HttpCode(200)
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'SolicitudUsuario', modelo: 'solicitudUsuario', accion: 'CREAR_CUENTA' })
  @ApiOperation({ summary: 'Crear la cuenta de una solicitud aprobada (administrador de TI)' })
  crearCuenta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearCuentaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.crearCuenta(id, dto, usuario);
  }
}
