import { Module } from '@nestjs/common';
import { ActivosController } from './activos.controller';
import { ActivosService } from './activos.service';

@Module({
  controllers: [ActivosController],
  providers: [ActivosService],
  exports: [ActivosService],
})
export class ActivosModule {}
