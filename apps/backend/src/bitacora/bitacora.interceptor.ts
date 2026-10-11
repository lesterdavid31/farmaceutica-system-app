import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, Observable, switchMap } from 'rxjs';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { PrismaService } from '../prisma/prisma.service';
import { CLAVE_AUDITAR, CLAVE_SIN_BITACORA, OpcionesAuditoria } from './auditar.decorator';
import { BitacoraService } from './bitacora.service';

const ACCION_POR_METODO: Record<string, string> = {
  POST: 'CREAR',
  PUT: 'ACTUALIZAR',
  PATCH: 'ACTUALIZAR',
  DELETE: 'ELIMINAR',
};

type PeticionAutenticada = Request & { user?: UsuarioAutenticado };

/** IP del cliente; detrás del proxy de Vercel llega en x-forwarded-for. */
export function ipDe(peticion: Request) {
  const reenviada = peticion.headers['x-forwarded-for'];
  const primera = (Array.isArray(reenviada) ? reenviada[0] : reenviada)?.split(',')[0]?.trim();
  return primera || peticion.ip || null;
}

/** Nombre de entidad por defecto a partir del controlador: UsuariosController → "Usuarios". */
function entidadPorDefecto(ctx: ExecutionContext) {
  return ctx.getClass().name.replace(/Controller$/, '');
}

/**
 * Registra en la bitácora toda petición de escritura que termina con éxito (RN-27).
 * Con @Auditar({ modelo }) también guarda el estado anterior del registro.
 */
@Injectable()
export class BitacoraInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly bitacora: BitacoraService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const peticion = ctx.switchToHttp().getRequest<PeticionAutenticada>();
    const accionPorMetodo = ACCION_POR_METODO[peticion.method];
    const omitir = this.reflector.getAllAndOverride<boolean>(CLAVE_SIN_BITACORA, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!accionPorMetodo || omitir) {
      return siguiente.handle();
    }

    const opciones = this.reflector.getAllAndOverride<OpcionesAuditoria | undefined>(
      CLAVE_AUDITAR,
      [ctx.getHandler(), ctx.getClass()],
    );
    const parametroId = opciones?.parametroId ?? 'id';
    const idRuta = (peticion.params as Record<string, string | undefined>)[parametroId];

    return from(this.leerAntes(opciones, idRuta)).pipe(
      switchMap((antes) =>
        siguiente.handle().pipe(
          switchMap(async (respuesta: unknown) => {
            const idRespuesta = (respuesta as { id?: unknown } | null)?.id;
            await this.bitacora.registrarSinFallar({
              usuarioId: peticion.user?.id,
              accion: opciones?.accion ?? accionPorMetodo,
              entidad: opciones?.entidad ?? entidadPorDefecto(ctx),
              entidadId: idRuta ?? (typeof idRespuesta === 'string' ? idRespuesta : null),
              datosAntes: antes,
              datosDespues: respuesta,
              ip: ipDe(peticion),
            });
            return respuesta;
          }),
        ),
      ),
    );
  }

  private async leerAntes(opciones: OpcionesAuditoria | undefined, id: string | undefined) {
    if (!opciones?.modelo || !id) {
      return null;
    }
    const delegado = this.prisma[opciones.modelo] as unknown as {
      findUnique(args: { where: { id: string } }): Promise<unknown>;
    };
    return delegado.findUnique({ where: { id } }).catch(() => null);
  }
}
