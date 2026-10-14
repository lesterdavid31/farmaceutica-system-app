import { Module } from '@nestjs/common';
import { ActivosModule } from '../activos/activos.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [ActivosModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
