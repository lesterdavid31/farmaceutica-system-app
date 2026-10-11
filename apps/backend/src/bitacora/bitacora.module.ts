import { Global, Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller';
import { BitacoraInterceptor } from './bitacora.interceptor';
import { BitacoraService } from './bitacora.service';

@Global()
@Module({
  controllers: [BitacoraController],
  providers: [BitacoraService, BitacoraInterceptor],
  exports: [BitacoraService, BitacoraInterceptor],
})
export class BitacoraModule {}
