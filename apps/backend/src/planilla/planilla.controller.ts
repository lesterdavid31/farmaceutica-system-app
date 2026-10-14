import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { EmpleadosService } from './empleados.service';
import {
  ActualizarEmpleadoDto,
  CrearEmpleadoDto,
  EditarLineaDto,
  FiltroEmpleadosDto,
  FiltroPlanillasDto,
  GenerarPlanillaDto,
  ReportePlanillaDto,
} from './planilla.dto';
import { PlanillasService } from './planillas.service';

/** El gerente gestiona los empleados y la planilla de su sucursal; el auditor solo consulta. */
@ApiTags('Planilla')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  @Get()
  @ApiOperation({ summary: 'Empleados (RF-26)' })
  listar(@Query() filtro: FiltroEmpleadosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.empleados.listar(filtro, usuario);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.empleados.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Empleado' })
  @ApiOperation({ summary: 'Registrar empleado' })
  crear(@Body() dto: CrearEmpleadoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.empleados.crear(dto, usuario);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Empleado', modelo: 'empleado' })
  @ApiOperation({ summary: 'Actualizar empleado' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarEmpleadoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.empleados.actualizar(id, dto, usuario);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Empleado', modelo: 'empleado', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar empleado (no se borra: conserva su historial)' })
  desactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.empleados.desactivar(id, usuario);
  }
}

@ApiTags('Planilla')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('planillas')
export class PlanillasController {
  constructor(private readonly planillas: PlanillasService) {}

  @Get()
  @ApiOperation({ summary: 'Planillas por ubicación, año y estado' })
  listar(@Query() filtro: FiltroPlanillasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.listar(filtro, usuario);
  }

  @Get('reporte')
  @ApiOperation({ summary: 'Gasto en planilla por mes y ubicación, y consolidado (RF-28)' })
  reporte(@Query() dto: ReportePlanillaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.reporte(dto, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Planilla con sus líneas y totales' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Planilla', accion: 'GENERAR' })
  @ApiOperation({ summary: 'Generar la planilla mensual de una ubicación (RF-27)' })
  generar(@Body() dto: GenerarPlanillaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.generar(dto, usuario);
  }

  @Patch(':id/detalles/:detalleId')
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Planilla', accion: 'EDITAR_LINEA' })
  @ApiOperation({ summary: 'Editar bonificación y otros descuentos de una línea (borrador)' })
  editarLinea(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detalleId', ParseUUIDPipe) detalleId: string,
    @Body() dto: EditarLineaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.planillas.editarLinea(id, detalleId, dto, usuario);
  }

  @Post(':id/cerrar')
  @HttpCode(200)
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Planilla', modelo: 'planilla', accion: 'CERRAR' })
  @ApiOperation({ summary: 'Cerrar la planilla: ya no se modifica (RN-23)' })
  cerrar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.cerrar(id, usuario);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN, Rol.GERENTE)
  @Auditar({ entidad: 'Planilla', modelo: 'planilla', accion: 'ELIMINAR' })
  @ApiOperation({ summary: 'Eliminar un borrador para generarlo de nuevo' })
  eliminar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.planillas.eliminar(id, usuario);
  }
}
