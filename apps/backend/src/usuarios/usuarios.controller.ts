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
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { ActualizarUsuarioDto, CrearUsuarioDto, FiltroUsuariosDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios con filtros por rol, ubicación y estado' })
  listar(@Query() filtro: FiltroUsuariosDto) {
    return this.usuarios.listar(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un usuario' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.obtener(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Usuario' })
  @ApiOperation({ summary: 'Crear un usuario con rol y ubicación' })
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuarios.crear(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Usuario', modelo: 'usuario' })
  @ApiOperation({ summary: 'Actualizar un usuario (incluido el cambio de contraseña)' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioActual() actor: UsuarioAutenticado,
  ) {
    return this.usuarios.actualizar(id, dto, actor.id);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Usuario', modelo: 'usuario', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar un usuario (no se borra: conserva su historial)' })
  desactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() actor: UsuarioAutenticado) {
    return this.usuarios.desactivar(id, actor.id);
  }
}
