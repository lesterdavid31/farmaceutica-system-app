import { Global, Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { MotorInventarioService } from './motor-inventario.service';

/** Global: compras, traslados y ventas usan el motor de inventario. */
@Global()
@Module({
  controllers: [InventarioController],
  providers: [InventarioService, MotorInventarioService],
  exports: [InventarioService, MotorInventarioService],
})
export class InventarioModule {}
