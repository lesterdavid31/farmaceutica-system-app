import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles } from '../common/decoradores';
import { Rol } from '../generated/prisma/enums';
import {
  ActualizarClienteDto,
  ActualizarDireccionDto,
  CrearClienteDto,
  DireccionDto,
  FiltroClientesDto,
} from './clientes.dto';
import { ClientesService } from './clientes.service';

/** Gestionan clientes el operador y el administrador; el auditor solo consulta. */
@ApiTags('Clientes')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.OPERADOR_CALL_CENTER)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar clientes por teléfono, nombre o NIT' })
  listar(@Query() filtro: FiltroClientesDto) {
    return this.clientes.listar(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Cliente con direcciones y últimos pedidos' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.obtener(id);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @Auditar({ entidad: 'Cliente' })
  @ApiOperation({ summary: 'Registrar cliente (RF-20)' })
  crear(@Body() dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @Auditar({ entidad: 'Cliente', modelo: 'cliente' })
  @ApiOperation({ summary: 'Actualizar o desactivar cliente' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarClienteDto) {
    return this.clientes.actualizar(id, dto);
  }

  @Post(':id/direcciones')
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @Auditar({ entidad: 'DireccionCliente', accion: 'CREAR' })
  @ApiOperation({ summary: 'Agregar dirección de entrega con coordenadas' })
  agregarDireccion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DireccionDto) {
    return this.clientes.agregarDireccion(id, dto);
  }

  @Patch(':id/direcciones/:direccionId')
  @Roles(Rol.ADMIN, Rol.OPERADOR_CALL_CENTER)
  @Auditar({ entidad: 'DireccionCliente', parametroId: 'direccionId' })
  @ApiOperation({ summary: 'Actualizar o desactivar dirección' })
  actualizarDireccion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('direccionId', ParseUUIDPipe) direccionId: string,
    @Body() dto: ActualizarDireccionDto,
  ) {
    return this.clientes.actualizarDireccion(id, direccionId, dto);
  }
}
