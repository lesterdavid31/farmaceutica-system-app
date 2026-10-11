import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles } from '../common/decoradores';
import { Rol } from '../generated/prisma/enums';
import {
  ActualizarUbicacionDto,
  CrearMunicipioDto,
  CrearUbicacionDto,
  FiltroUbicacionesDto,
} from './ubicaciones.dto';
import { UbicacionesService } from './ubicaciones.service';

@ApiTags('Ubicaciones')
@ApiBearerAuth()
@Controller()
export class UbicacionesController {
  constructor(private readonly ubicaciones: UbicacionesService) {}

  @Get('ubicaciones')
  @ApiOperation({ summary: 'Listar ubicaciones (bodega, farmacias y stands)' })
  listar(@Query() filtro: FiltroUbicacionesDto) {
    return this.ubicaciones.listar(filtro);
  }

  @Get('ubicaciones/:id')
  @ApiOperation({ summary: 'Detalle de una ubicación' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.ubicaciones.obtener(id);
  }

  @Post('ubicaciones')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Ubicacion' })
  @ApiOperation({ summary: 'Crear una ubicación' })
  crear(@Body() dto: CrearUbicacionDto) {
    return this.ubicaciones.crear(dto);
  }

  @Patch('ubicaciones/:id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Ubicacion', modelo: 'ubicacion' })
  @ApiOperation({ summary: 'Actualizar una ubicación' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarUbicacionDto) {
    return this.ubicaciones.actualizar(id, dto);
  }

  @Delete('ubicaciones/:id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Ubicacion', modelo: 'ubicacion', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar una ubicación (no se borra: conserva su historial)' })
  desactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.ubicaciones.desactivar(id);
  }

  @Get('departamentos')
  @ApiOperation({ summary: 'Departamentos de Guatemala con sus municipios cargados' })
  departamentos() {
    return this.ubicaciones.departamentos();
  }

  @Post('municipios')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Municipio' })
  @ApiOperation({ summary: 'Agregar un municipio al catálogo' })
  crearMunicipio(@Body() dto: CrearMunicipioDto) {
    return this.ubicaciones.crearMunicipio(dto);
  }
}
