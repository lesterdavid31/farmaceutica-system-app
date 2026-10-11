import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import {
  AnularVentaDto,
  BusquedaProductosVentaDto,
  CrearVentaDto,
  FiltroVentasDto,
} from './ventas.dto';
import { VentasService } from './ventas.service';

@ApiTags('Ventas')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE, Rol.CAJERO)
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Get('productos')
  @Roles(Rol.CAJERO)
  @ApiOperation({ summary: 'Búsqueda del punto de venta con precio y existencia vigente' })
  productos(
    @Query() filtro: BusquedaProductosVentaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.ventas.productos(filtro, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Historial de ventas (GERENTE y CAJERO: su ubicación)' })
  listar(@Query() filtro: FiltroVentasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ventas.listar(filtro, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle y comprobante de una venta' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ventas.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.CAJERO)
  @Auditar({ entidad: 'Venta', accion: 'VENDER' })
  @ApiOperation({ summary: 'Registrar venta de mostrador (RF-15)' })
  crear(@Body() dto: CrearVentaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ventas.crear(dto, usuario);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @Roles(Rol.GERENTE)
  @Auditar({ entidad: 'Venta', accion: 'ANULAR' })
  @ApiOperation({ summary: 'Anular venta con motivo (RF-18, RN-14)' })
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularVentaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.ventas.anular(id, dto, usuario);
  }
}
