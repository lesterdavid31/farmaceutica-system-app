import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { AbrirTurnoDto, CerrarTurnoDto, FiltroTurnosDto, MovimientoManualDto } from './caja.dto';
import { CajaService } from './caja.service';

/** Operan la caja los cajeros; ADMIN, AUDITOR y GERENTE consultan los turnos. */
@ApiTags('Caja')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE, Rol.CAJERO)
@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get('turno-actual')
  @Roles(Rol.CAJERO)
  @ApiOperation({ summary: 'Turno abierto del cajero, o null' })
  actual(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.actual(usuario);
  }

  @Get('turnos')
  @ApiOperation({ summary: 'Turnos de caja (el cajero ve solo los suyos)' })
  listar(@Query() filtro: FiltroTurnosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.listar(filtro, usuario);
  }

  @Get('turnos/:id')
  @ApiOperation({ summary: 'Turno con movimientos y resumen de arqueo' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.obtener(id, usuario);
  }

  @Post('turnos')
  @Roles(Rol.CAJERO)
  @Auditar({ entidad: 'TurnoCaja', accion: 'ABRIR_CAJA' })
  @ApiOperation({ summary: 'Abrir turno de caja con monto inicial (RF-14)' })
  abrir(@Body() dto: AbrirTurnoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.caja.abrir(dto, usuario);
  }

  @Post('turnos/:id/movimientos')
  @Roles(Rol.CAJERO)
  @Auditar({ entidad: 'TurnoCaja', accion: 'MOVIMIENTO_CAJA' })
  @ApiOperation({ summary: 'Registrar gasto, retiro o depósito (RF-16)' })
  registrarMovimiento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MovimientoManualDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.caja.registrarMovimiento(id, dto, usuario);
  }

  @Post('turnos/:id/cerrar')
  @HttpCode(200)
  @Roles(Rol.CAJERO)
  @Auditar({ entidad: 'TurnoCaja', accion: 'CERRAR_CAJA' })
  @ApiOperation({ summary: 'Cerrar turno con arqueo (RF-17)' })
  cerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CerrarTurnoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.caja.cerrar(id, dto, usuario);
  }
}
