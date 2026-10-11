import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BitacoraInterceptor } from './bitacora/bitacora.interceptor';
import { BitacoraModule } from './bitacora/bitacora.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { FiltroErrores } from './common/errores';
import { ComprasModule } from './compras/compras.module';
import { InventarioModule } from './inventario/inventario.module';
import { AuditorSoloLecturaGuard, JwtAuthGuard, RolesGuard } from './common/guards';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite básico por IP; el login aplica uno más estricto con @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      errorMessage: 'Demasiados intentos. Espere un minuto e intente de nuevo.',
    }),
    PrismaModule,
    BitacoraModule,
    AuthModule,
    HealthModule,
    ConfiguracionModule,
    UbicacionesModule,
    UsuariosModule,
    CatalogoModule,
    InventarioModule,
    ComprasModule,
  ],
  providers: [
    // Orden de los guards globales: autenticación → rol → solo lectura del auditor.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AuditorSoloLecturaGuard },
    { provide: APP_INTERCEPTOR, useClass: BitacoraInterceptor },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
