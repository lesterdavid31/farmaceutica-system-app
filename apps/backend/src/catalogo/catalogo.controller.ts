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
  ActualizarCategoriaDto,
  ActualizarProductoDto,
  ActualizarProveedorDto,
  CrearCategoriaDto,
  CrearProductoDto,
  CrearProveedorDto,
  FiltroCategoriasDto,
  FiltroProductosDto,
  FiltroProveedoresDto,
} from './catalogo.dto';
import { CatalogoService } from './catalogo.service';

@ApiTags('Catálogo: categorías')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías de productos' })
  listar(@Query() filtro: FiltroCategoriasDto) {
    return this.catalogo.listarCategorias(filtro);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.obtenerCategoria(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Categoria' })
  crear(@Body() dto: CrearCategoriaDto) {
    return this.catalogo.crearCategoria(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Categoria', modelo: 'categoria' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCategoriaDto) {
    return this.catalogo.actualizarCategoria(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Categoria', modelo: 'categoria', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar una categoría' })
  desactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.desactivarCategoria(id);
  }
}

@ApiTags('Catálogo: proveedores')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.GERENTE, Rol.AUDITOR)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar proveedores' })
  listar(@Query() filtro: FiltroProveedoresDto) {
    return this.catalogo.listarProveedores(filtro);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.obtenerProveedor(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Proveedor' })
  crear(@Body() dto: CrearProveedorDto) {
    return this.catalogo.crearProveedor(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Proveedor', modelo: 'proveedor' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarProveedorDto) {
    return this.catalogo.actualizarProveedor(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Proveedor', modelo: 'proveedor', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar un proveedor' })
  desactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.desactivarProveedor(id);
  }
}

@ApiTags('Catálogo: productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar productos por nombre, SKU o principio activo' })
  listar(@Query() filtro: FiltroProductosDto) {
    return this.catalogo.listarProductos(filtro);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.obtenerProducto(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Producto' })
  crear(@Body() dto: CrearProductoDto) {
    return this.catalogo.crearProducto(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Producto', modelo: 'producto' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarProductoDto) {
    return this.catalogo.actualizarProducto(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Producto', modelo: 'producto', accion: 'DESACTIVAR' })
  @ApiOperation({ summary: 'Desactivar un producto' })
  desactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogo.desactivarProducto(id);
  }
}
