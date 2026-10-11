import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { CrearCompraDto, FiltroComprasDto } from './compras.dto';
import { ComprasService } from './compras.service';

@ApiTags('Compras')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @ApiOperation({ summary: 'Listar compras a proveedores' })
  listar(@Query() filtro: FiltroComprasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.compras.listar(filtro, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una compra con sus lotes' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.compras.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Compra' })
  @ApiOperation({ summary: 'Registrar una compra en la bodega central (RF-04)' })
  crear(@Body() dto: CrearCompraDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.compras.crear(dto, usuario);
  }
}
