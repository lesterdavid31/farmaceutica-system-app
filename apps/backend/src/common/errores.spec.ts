import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { errorDeHttp, errorDePrisma, ReglaNegocioException } from './errores';

function errorPrisma(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('formato uniforme de errores', () => {
  it('las reglas de negocio responden 422 con detalles opcionales', () => {
    expect(errorDeHttp(new ReglaNegocioException('Sin existencia', { disponible: 4 }))).toEqual({
      statusCode: 422,
      message: 'Sin existencia',
      error: 'Regla de negocio',
      detalles: { disponible: 4 },
    });
  });

  it('resume los errores de validación y los envía como detalles', () => {
    const error = new BadRequestException({ message: ['campo a inválido', 'campo b inválido'] });
    expect(errorDeHttp(error)).toEqual({
      statusCode: 400,
      message: 'Los datos enviados no son válidos',
      error: 'Solicitud inválida',
      detalles: ['campo a inválido', 'campo b inválido'],
    });
  });

  it('traduce el nombre del estado al español', () => {
    expect(errorDeHttp(new ForbiddenException('No puede'))).toMatchObject({
      statusCode: 403,
      error: 'Sin permiso',
    });
  });

  it('un valor único duplicado de Prisma es 409', () => {
    expect(errorDePrisma(errorPrisma('P2002', { target: ['email'] }))).toEqual({
      statusCode: 409,
      message: 'Ya existe un registro con el mismo valor en: email',
      error: 'Conflicto',
    });
  });

  it('un registro inexistente de Prisma es 404', () => {
    expect(errorDePrisma(errorPrisma('P2025')).statusCode).toBe(404);
  });

  it('otros errores de Prisma son 500 sin exponer detalles internos', () => {
    expect(errorDePrisma(errorPrisma('P1001'))).toEqual({
      statusCode: 500,
      message: 'Error al acceder a la base de datos',
      error: 'Error interno',
    });
  });
});
