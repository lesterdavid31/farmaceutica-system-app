import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import {
  AjusteDto,
  BajaDto,
  FiltroExistenciasDto,
  FiltroKardexDto,
  FiltroUbicacionDto,
  StockMinimoDto,
} from './inventario.dto';
import { InventarioService } from './inventario.service';

const LECTURA_INVENTARIO = [Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE] as const;
const GESTION_INVENTARIO = [Rol.ADMIN, Rol.GERENTE] as const;

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get('existencias')
  @ApiOperation({
    summary: 'Existencias por producto con desglose por lote y vencimiento (RF-05)',
    description:
      'Gerentes y cajeros solo ven su ubicación. Sin ubicación, los roles globales ven el total de todas.',
  })
  existencias(@Query() filtro: FiltroExistenciasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.existencias(filtro, usuario);
  }

  @Get('productos/:productoId/stock')
  @ApiOperation({ summary: 'Stock de un producto en todas las ubicaciones (RF-06)' })
  stockGlobal(@Param('productoId', ParseUUIDPipe) productoId: string) {
    return this.inventario.stockGlobal(productoId);
  }

  @Get('kardex')
  @Roles(...LECTURA_INVENTARIO)
  @ApiOperation({ summary: 'Kardex por producto y ubicación con saldo acumulado (RF-07)' })
  kardex(@Query() filtro: FiltroKardexDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.kardex(filtro, usuario);
  }

  @Get('alertas')
  @Roles(...LECTURA_INVENTARIO)
  @ApiOperation({ summary: 'Vencidos pendientes de baja, próximos a vencer y bajo mínimo (RF-09)' })
  alertas(@Query() filtro: FiltroUbicacionDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.alertas(filtro.ubicacionId, usuario);
  }

  @Get('stock-minimo')
  @Roles(...LECTURA_INVENTARIO)
  @ApiOperation({ summary: 'Stock mínimo configurado por ubicación (RN-05)' })
  stockMinimos(@Query() filtro: FiltroUbicacionDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.stockMinimos(filtro.ubicacionId, usuario);
  }

  @Put('stock-minimo')
  @Roles(...GESTION_INVENTARIO)
  @Auditar({ entidad: 'StockMinimo' })
  @ApiOperation({
    summary: 'Definir el stock mínimo de un producto en una ubicación (0 lo elimina)',
  })
  guardarStockMinimo(@Body() dto: StockMinimoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.guardarStockMinimo(dto, usuario);
  }

  @Post('ajustes')
  @Roles(...GESTION_INVENTARIO)
  @Auditar({ entidad: 'AjusteInventario' })
  @ApiOperation({ summary: 'Registrar un ajuste de inventario con motivo obligatorio (RF-08)' })
  ajustar(@Body() dto: AjusteDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.ajustar(dto, usuario);
  }

  @Post('bajas')
  @Roles(...GESTION_INVENTARIO)
  @Auditar({ entidad: 'BajaVencimiento', accion: 'DAR_DE_BAJA' })
  @ApiOperation({ summary: 'Dar de baja un lote vencido, o todos los de la ubicación (RF-10)' })
  darDeBaja(@Body() dto: BajaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventario.darDeBaja(dto, usuario);
  }
}
