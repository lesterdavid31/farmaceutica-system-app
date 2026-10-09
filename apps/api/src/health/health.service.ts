import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoBaseDatos, EstadoSalud } from './health.dto';

const TIEMPO_LIMITE_BD_MS = 5000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerEstado(): Promise<EstadoSalud> {
    return {
      estado: 'ok',
      servicio: 'api-farmacias',
      version: process.env.npm_package_version ?? '0.1.0',
      entorno: process.env.NODE_ENV ?? 'development',
      fecha: new Date().toISOString(),
      baseDatos: await this.verificarBaseDatos(),
    };
  }

  private async verificarBaseDatos(): Promise<EstadoBaseDatos> {
    if (!this.prisma.configurada) {
      return 'sin_configurar';
    }
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(
        () => rechazar(new Error('Tiempo de espera agotado')),
        TIEMPO_LIMITE_BD_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, limite]);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      clearTimeout(temporizador);
    }
  }
}
