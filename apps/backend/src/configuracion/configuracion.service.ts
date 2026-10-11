import { Injectable } from '@nestjs/common';
import { ReglaNegocioException } from '../common/errores';
import { PrismaService } from '../prisma/prisma.service';
import { CLAVES_PARAMETROS, ClaveParametro, PARAMETROS, validarParametro } from './parametros';

export interface ParametroConfiguracion {
  clave: ClaveParametro;
  etiqueta: string;
  descripcion: string;
  valor: number;
  porDefecto: number;
  minimo: number;
  maximo: number;
  decimales: number;
  unidad: string;
}

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos los parámetros con su valor actual (o el valor por defecto si no se ha guardado). */
  async listar(): Promise<ParametroConfiguracion[]> {
    const guardados = await this.valoresGuardados();
    return CLAVES_PARAMETROS.map((clave) => ({
      clave,
      ...PARAMETROS[clave],
      valor: guardados.get(clave) ?? PARAMETROS[clave].porDefecto,
    }));
  }

  /** Valor numérico de un parámetro, para usar en las reglas de negocio. */
  async obtener(clave: ClaveParametro): Promise<number> {
    const fila = await this.prisma.configuracion.findUnique({ where: { clave } });
    const valor = fila ? Number(fila.valor) : NaN;
    return Number.isFinite(valor) ? valor : PARAMETROS[clave].porDefecto;
  }

  /** Actualiza uno o varios parámetros. Valida todo antes de guardar nada. */
  async actualizar(valores: Record<string, number>) {
    const entradas = Object.entries(valores);
    if (entradas.length === 0) {
      throw new ReglaNegocioException('No se envió ningún parámetro para actualizar');
    }
    const errores: string[] = [];
    for (const [clave, valor] of entradas) {
      if (!(clave in PARAMETROS)) {
        errores.push(`El parámetro ${clave} no existe`);
        continue;
      }
      const error = validarParametro(clave as ClaveParametro, valor);
      if (error) {
        errores.push(error);
      }
    }
    if (errores.length > 0) {
      throw new ReglaNegocioException('Revise los valores de la configuración', errores);
    }
    await this.prisma.$transaction(
      entradas.map(([clave, valor]) =>
        this.prisma.configuracion.upsert({
          where: { clave },
          update: { valor: String(valor) },
          create: {
            clave,
            valor: String(valor),
            descripcion: PARAMETROS[clave as ClaveParametro].descripcion,
          },
        }),
      ),
    );
    return this.listar();
  }

  private async valoresGuardados() {
    const filas = await this.prisma.configuracion.findMany({
      where: { clave: { in: CLAVES_PARAMETROS } },
    });
    return new Map(
      filas
        .map((f) => [f.clave, Number(f.valor)] as const)
        .filter(([, valor]) => Number.isFinite(valor)),
    );
  }
}
