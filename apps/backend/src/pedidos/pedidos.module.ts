import { Module } from '@nestjs/common';
import { CajaModule } from '../caja/caja.module';
import { TrasladosModule } from '../traslados/traslados.module';
import { VentasModule } from '../ventas/ventas.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [CajaModule, VentasModule, TrasladosModule],
  controllers: [PedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
