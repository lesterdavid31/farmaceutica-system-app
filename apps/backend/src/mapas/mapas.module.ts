import { Global, Module } from '@nestjs/common';
import { MapasService } from './mapas.service';

@Global()
@Module({
  providers: [MapasService],
  exports: [MapasService],
})
export class MapasModule {}
