import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/** Violación de una regla de negocio: responde 422 con un mensaje claro en español. */
export class ReglaNegocioException extends UnprocessableEntityException {
  constructor(mensaje: string, detalles?: unknown) {
    super({ message: mensaje, error: 'Regla de negocio', detalles });
  }
}

export interface CuerpoError {
  statusCode: number;
  message: string;
  error: string;
  detalles?: unknown;
}

const NOMBRES_ESTADO: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto',
  422: 'Regla de negocio',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
};

function nombreEstado(status: number) {
  return NOMBRES_ESTADO[status] ?? 'Error';
}

/** Traduce errores conocidos de Prisma a respuestas HTTP comprensibles. */
export function errorDePrisma(error: Prisma.PrismaClientKnownRequestError): CuerpoError {
  switch (error.code) {
    case 'P2002': {
      const campos = (error.meta?.target as string[] | undefined)?.join(', ');
      return {
        statusCode: HttpStatus.CONFLICT,
        message: campos
          ? `Ya existe un registro con el mismo valor en: ${campos}`
          : 'Ya existe un registro con esos datos',
        error: nombreEstado(409),
      };
    }
    case 'P2003':
      return {
        statusCode: HttpStatus.CONFLICT,
        message: 'El registro está relacionado con otros datos o hace referencia a uno inexistente',
        error: nombreEstado(409),
      };
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'El registro solicitado no existe',
        error: nombreEstado(404),
      };
    default:
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error al acceder a la base de datos',
        error: nombreEstado(500),
      };
  }
}

/** Normaliza una HttpException al formato `{ statusCode, message, error, detalles? }`. */
export function errorDeHttp(excepcion: HttpException): CuerpoError {
  const statusCode = excepcion.getStatus();
  const respuesta = excepcion.getResponse();
  if (typeof respuesta === 'string') {
    return { statusCode, message: respuesta, error: nombreEstado(statusCode) };
  }
  const cuerpo = respuesta as { message?: string | string[]; error?: string; detalles?: unknown };
  // ValidationPipe devuelve un arreglo de mensajes: se resumen y se envían como detalles.
  if (Array.isArray(cuerpo.message)) {
    return {
      statusCode,
      message: 'Los datos enviados no son válidos',
      error: nombreEstado(statusCode),
      detalles: cuerpo.message,
    };
  }
  return {
    statusCode,
    message: cuerpo.message ?? excepcion.message,
    error: nombreEstado(statusCode),
    ...(cuerpo.detalles !== undefined && { detalles: cuerpo.detalles }),
  };
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(excepcion: unknown, host: ArgumentsHost) {
    const respuesta = host.switchToHttp().getResponse<Response>();
    let cuerpo: CuerpoError;
    if (excepcion instanceof HttpException) {
      cuerpo = errorDeHttp(excepcion);
    } else if (excepcion instanceof Prisma.PrismaClientKnownRequestError) {
      cuerpo = errorDePrisma(excepcion);
    } else {
      cuerpo = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Ocurrió un error interno. Intente de nuevo.',
        error: nombreEstado(500),
      };
    }
    if (cuerpo.statusCode >= 500) {
      this.logger.error(excepcion instanceof Error ? excepcion.stack : String(excepcion));
    }
    respuesta.status(cuerpo.statusCode).json(cuerpo);
  }
}
