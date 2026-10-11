import { Module } from '@nestjs/common';
import {
  CategoriasController,
  ProductosController,
  ProveedoresController,
} from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

@Module({
  controllers: [CategoriasController, ProveedoresController, ProductosController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
