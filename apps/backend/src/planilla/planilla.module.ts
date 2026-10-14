import { Module } from '@nestjs/common';
import { EmpleadosService } from './empleados.service';
import { EmpleadosController, PlanillasController } from './planilla.controller';
import { PlanillasService } from './planillas.service';

@Module({
  controllers: [EmpleadosController, PlanillasController],
  providers: [EmpleadosService, PlanillasService],
  exports: [EmpleadosService, PlanillasService],
})
export class PlanillaModule {}
