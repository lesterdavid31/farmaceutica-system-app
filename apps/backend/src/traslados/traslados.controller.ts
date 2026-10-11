import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import {
  CancelarTrasladoDto,
  CrearTrasladoDto,
  FiltroTrasladosDto,
  RecibirTrasladoDto,
} from './traslados.dto';
import { TrasladosService } from './traslados.service';

/** Lectura: ADMIN y AUDITOR ven todos; GERENTE, los que salen de su ubicación o llegan a ella. */
@ApiTags('Traslados')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('traslados')
export class TrasladosController {
  constructor(private readonly traslados: TrasladosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar traslados (RF-13)' })
  listar(@Query() filtro: FiltroTrasladosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.traslados.listar(filtro, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con lotes, historial de estados y acciones disponibles' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.traslados.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Traslado', accion: 'SOLICITAR' })
  @ApiOperation({ summary: 'Solicitar un traslado (RF-11)' })
  crear(@Body() dto: CrearTrasladoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.traslados.crear(dto, usuario);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Traslado', modelo: 'traslado', accion: 'APROBAR' })
  @ApiOperation({ summary: 'Aprobar (ADMIN o gerente de origen)' })
  aprobar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.traslados.aprobar(id, usuario);
  }

  @Post(':id/despachar')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Traslado', modelo: 'traslado', accion: 'DESPACHAR' })
  @ApiOperation({ summary: 'Despachar: descuenta del origen por FEFO (RN-09)' })
  despachar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.traslados.despachar(id, usuario);
  }

  @Post(':id/recibir')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Traslado', modelo: 'traslado', accion: 'RECIBIR' })
  @ApiOperation({ summary: 'Recibir con cantidades reales; la diferencia queda como ajuste' })
  recibir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecibirTrasladoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.traslados.recibir(id, dto, usuario);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Traslado', modelo: 'traslado', accion: 'CANCELAR' })
  @ApiOperation({ summary: 'Cancelar antes de despachar, con motivo' })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarTrasladoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.traslados.cancelar(id, dto, usuario);
  }
}
