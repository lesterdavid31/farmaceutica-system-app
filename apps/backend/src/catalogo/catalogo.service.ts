import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ReglaNegocioException } from '../common/errores';
import { pagina, saltar } from '../common/paginacion';
import { PrismaService } from '../prisma/prisma.service';
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

const INCLUIR_CATEGORIA = { categoria: { select: { id: true, nombre: true } } } as const;

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Categorías ──────────────────────────────────────────────────────────────

  async listarCategorias(filtro: FiltroCategoriasDto) {
    const where: Prisma.CategoriaWhereInput = {
      ...(filtro.activa !== undefined && { activa: filtro.activa }),
      ...(filtro.q && { nombre: { contains: filtro.q, mode: 'insensitive' } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.categoria.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: { _count: { select: { productos: true } } },
        ...saltar(filtro),
      }),
      this.prisma.categoria.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtenerCategoria(id: string) {
    const categoria = await this.prisma.categoria.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException('La categoría no existe');
    }
    return categoria;
  }

  crearCategoria(dto: CrearCategoriaDto) {
    return this.prisma.categoria.create({ data: dto });
  }

  async actualizarCategoria(id: string, dto: ActualizarCategoriaDto) {
    await this.obtenerCategoria(id);
    return this.prisma.categoria.update({ where: { id }, data: dto });
  }

  async desactivarCategoria(id: string) {
    await this.obtenerCategoria(id);
    return this.prisma.categoria.update({ where: { id }, data: { activa: false } });
  }

  // ─── Proveedores ─────────────────────────────────────────────────────────────

  async listarProveedores(filtro: FiltroProveedoresDto) {
    const where: Prisma.ProveedorWhereInput = {
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(filtro.q && {
        OR: [
          { nombre: { contains: filtro.q, mode: 'insensitive' } },
          { nit: { contains: filtro.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.proveedor.findMany({ where, orderBy: { nombre: 'asc' }, ...saltar(filtro) }),
      this.prisma.proveedor.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtenerProveedor(id: string) {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!proveedor) {
      throw new NotFoundException('El proveedor no existe');
    }
    return proveedor;
  }

  crearProveedor(dto: CrearProveedorDto) {
    return this.prisma.proveedor.create({ data: dto });
  }

  async actualizarProveedor(id: string, dto: ActualizarProveedorDto) {
    await this.obtenerProveedor(id);
    return this.prisma.proveedor.update({ where: { id }, data: dto });
  }

  async desactivarProveedor(id: string) {
    await this.obtenerProveedor(id);
    return this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
  }

  // ─── Productos ───────────────────────────────────────────────────────────────

  async listarProductos(filtro: FiltroProductosDto) {
    const where: Prisma.ProductoWhereInput = {
      ...(filtro.categoriaId && { categoriaId: filtro.categoriaId }),
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(filtro.q && {
        OR: [
          { nombre: { contains: filtro.q, mode: 'insensitive' } },
          { sku: { contains: filtro.q, mode: 'insensitive' } },
          { principioActivo: { contains: filtro.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        include: INCLUIR_CATEGORIA,
        orderBy: { nombre: 'asc' },
        ...saltar(filtro),
      }),
      this.prisma.producto.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtenerProducto(id: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: INCLUIR_CATEGORIA,
    });
    if (!producto) {
      throw new NotFoundException('El producto no existe');
    }
    return producto;
  }

  async crearProducto(dto: CrearProductoDto) {
    await this.verificarCategoriaActiva(dto.categoriaId);
    return this.prisma.producto.create({ data: dto, include: INCLUIR_CATEGORIA });
  }

  async actualizarProducto(id: string, dto: ActualizarProductoDto) {
    await this.obtenerProducto(id);
    if (dto.categoriaId) {
      await this.verificarCategoriaActiva(dto.categoriaId);
    }
    return this.prisma.producto.update({ where: { id }, data: dto, include: INCLUIR_CATEGORIA });
  }

  async desactivarProducto(id: string) {
    await this.obtenerProducto(id);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
      include: INCLUIR_CATEGORIA,
    });
  }

  private async verificarCategoriaActiva(categoriaId: string) {
    const categoria = await this.prisma.categoria.findUnique({ where: { id: categoriaId } });
    if (!categoria) {
      throw new ReglaNegocioException('La categoría seleccionada no existe');
    }
    if (!categoria.activa) {
      throw new ReglaNegocioException('La categoría seleccionada está desactivada');
    }
  }
}
