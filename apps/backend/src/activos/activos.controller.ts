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
import {
  ActualizarActivoDto,
  ActualizarCategoriaActivoDto,
  CrearActivoDto,
  FiltroActivosDto,
  ReporteActivosDto,
  TrasladarActivoDto,
} from './activos.dto';
import { ActivosService } from './activos.service';

/** Los activos los gestiona el administrador; el auditor consulta todo y el gerente, su sucursal. */
@ApiTags('Activos fijos')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('activos')
export class ActivosController {
  constructor(private readonly activos: ActivosService) {}

  @Get()
  @ApiOperation({ summary: 'Activos con su valor en libros a hoy' })
  listar(@Query() filtro: FiltroActivosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.activos.listar(filtro, usuario);
  }

  @Get('reporte')
  @ApiOperation({ summary: 'Valor en libros a una fecha por ubicación y categoría (RF-31)' })
  reporte(@Query() dto: ReporteActivosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.activos.reporte(dto, usuario);
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Categorías con su vida útil por defecto (RN-25)' })
  categorias() {
    return this.activos.listarCategorias();
  }

  @Patch('categorias/:id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'CategoriaActivo', modelo: 'categoriaActivo' })
  @ApiOperation({ summary: 'Cambiar la vida útil por defecto de una categoría' })
  actualizarCategoria(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarCategoriaActivoDto,
  ) {
    return this.activos.actualizarCategoria(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con historial de ubicaciones y depreciación por año' })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.activos.obtener(id, usuario);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'ActivoFijo' })
  @ApiOperation({ summary: 'Registrar activo (RF-29)' })
  crear(@Body() dto: CrearActivoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.activos.crear(dto, usuario);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'ActivoFijo', modelo: 'activoFijo' })
  @ApiOperation({ summary: 'Actualizar activo (la ubicación se cambia con un traslado)' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarActivoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.activos.actualizar(id, dto, usuario);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'ActivoFijo', modelo: 'activoFijo', accion: 'DAR_DE_BAJA' })
  @ApiOperation({ summary: 'Dar de baja (no se borra)' })
  darDeBaja(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.activos.darDeBaja(id, usuario);
  }

  @Post(':id/trasladar')
  @HttpCode(200)
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'ActivoFijo', modelo: 'activoFijo', accion: 'TRASLADAR' })
  @ApiOperation({ summary: 'Trasladar a otra ubicación, con historial (RF-30)' })
  trasladar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrasladarActivoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.activos.trasladar(id, dto, usuario);
  }
}
