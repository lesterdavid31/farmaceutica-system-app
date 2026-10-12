import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar, SinBitacora } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import {
  AsignarRepartidorDto,
  CancelarPedidoDto,
  ConsultaDisponibilidadDto,
  CrearPedidoDto,
  EntregarPedidoDto,
  FiltroPedidosDto,
  FiltroRepartidoresDto,
} from './pedidos.dto';
import { PedidosService } from './pedidos.service';

const SUCURSAL = [Rol.ADMIN, Rol.GERENTE, Rol.CAJERO] as const;

@ApiTags('Pedidos')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.OPERADOR_CALL_CENTER, Rol.GERENTE, Rol.CAJERO)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post('disponibilidad')
  @HttpCode(200)
  @SinBitacora()
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @ApiOperation({
    summary: 'Consultar disponibilidad y tiempos por sucursal (RF-21, RN-15 a RN-17)',
  })
  disponibilidad(@Body() dto: ConsultaDisponibilidadDto) {
    return this.pedidos.disponibilidad(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Seguimiento (operador) y bandeja de la sucursal, con atrasos' })
  listar(@Query() filtro: FiltroPedidosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.listar(filtro, usuario);
  }

  @Get('repartidores')
  @Roles(...SUCURSAL)
  @ApiOperation({ summary: 'Repartidores activos de la sucursal' })
  repartidores(
    @Query() filtro: FiltroRepartidoresDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.pedidos.repartidores(filtro, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con historial, entrega, venta y traslados' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @Auditar({ entidad: 'Pedido' })
  @ApiOperation({ summary: 'Crear pedido con la sucursal elegida (RF-22)' })
  crear(@Body() dto: CrearPedidoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.crear(dto, usuario);
  }

  @Post(':id/preparar')
  @HttpCode(200)
  @Roles(...SUCURSAL)
  @Auditar({ entidad: 'Pedido', modelo: 'pedido', accion: 'PREPARAR' })
  @ApiOperation({ summary: 'Preparar: descuenta inventario y genera la venta (RN-21)' })
  preparar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.ejecutar('preparar', id, usuario);
  }

  @Post(':id/asignar')
  @HttpCode(200)
  @Roles(...SUCURSAL)
  @Auditar({ entidad: 'Pedido', modelo: 'pedido', accion: 'ASIGNAR' })
  @ApiOperation({ summary: 'Asignar repartidor (RN-20)' })
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AsignarRepartidorDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.pedidos.ejecutar('asignar', id, usuario, dto);
  }

  @Post(':id/salir')
  @HttpCode(200)
  @Roles(...SUCURSAL)
  @Auditar({ entidad: 'Pedido', modelo: 'pedido', accion: 'DESPACHAR' })
  @ApiOperation({ summary: 'El repartidor sale a entregar' })
  salir(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.ejecutar('salir', id, usuario);
  }

  @Post(':id/entregar')
  @HttpCode(200)
  @Roles(...SUCURSAL)
  @Auditar({ entidad: 'Pedido', modelo: 'pedido', accion: 'ENTREGAR' })
  @ApiOperation({ summary: 'Confirmar entrega y registrar el cobro en caja (RF-24)' })
  entregar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EntregarPedidoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.pedidos.ejecutar('entregar', id, usuario, dto);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER, Rol.GERENTE)
  @Auditar({ entidad: 'Pedido', modelo: 'pedido', accion: 'CANCELAR' })
  @ApiOperation({ summary: 'Cancelar con motivo (hasta EN_CAMINO)' })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarPedidoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.pedidos.ejecutar('cancelar', id, usuario, dto);
  }
}
