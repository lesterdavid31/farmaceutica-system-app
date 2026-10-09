import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

function crearServicio(prisma: Partial<PrismaService>) {
  return new HealthService(prisma as PrismaService);
}

describe('HealthService', () => {
  it('indica que la base de datos no está configurada cuando falta DATABASE_URL', async () => {
    const queryRaw = jest.fn();
    const servicio = crearServicio({ configurada: false, $queryRaw: queryRaw });

    const estado = await servicio.obtenerEstado();

    expect(estado.estado).toBe('ok');
    expect(estado.baseDatos).toBe('sin_configurar');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reporta la base de datos en línea cuando la consulta responde', async () => {
    const servicio = crearServicio({
      configurada: true,
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    });

    await expect(servicio.obtenerEstado()).resolves.toMatchObject({ baseDatos: 'ok' });
  });

  it('reporta error sin lanzar excepción cuando la base de datos falla', async () => {
    const servicio = crearServicio({
      configurada: true,
      $queryRaw: jest.fn().mockRejectedValue(new Error('conexión rechazada')),
    });

    await expect(servicio.obtenerEstado()).resolves.toMatchObject({ baseDatos: 'error' });
  });
});
