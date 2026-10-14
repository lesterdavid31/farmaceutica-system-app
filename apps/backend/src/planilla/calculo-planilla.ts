import { Prisma } from '../generated/prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Monto = Prisma.Decimal | number | string;

export interface EntradaLinea {
  salarioBase: Monto;
  bonificacion: Monto;
  /** Porcentaje de la cuota laboral del IGSS, por ejemplo 4.83. */
  porcentajeIgss: Monto;
  otrosDescuentos: Monto;
}

export interface LineaPlanilla {
  salarioBase: Decimal;
  bonificacion: Decimal;
  igss: Decimal;
  otrosDescuentos: Decimal;
  liquido: Decimal;
}

const centavos = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * RN-22: IGSS = salario base × porcentaje (redondeado al centavo); líquido = salario +
 * bonificación − IGSS − otros descuentos. La bonificación incentivo no cotiza al IGSS.
 */
export function calcularLinea(e: EntradaLinea): LineaPlanilla {
  const salarioBase = centavos(new Decimal(e.salarioBase));
  const bonificacion = centavos(new Decimal(e.bonificacion));
  const otrosDescuentos = centavos(new Decimal(e.otrosDescuentos));
  const igss = centavos(salarioBase.mul(new Decimal(e.porcentajeIgss)).div(100));
  return {
    salarioBase,
    bonificacion,
    igss,
    otrosDescuentos,
    liquido: salarioBase.add(bonificacion).sub(igss).sub(otrosDescuentos),
  };
}

/** Errores de una línea editada: montos no negativos y líquido que no quede en negativo. */
export function erroresLinea(linea: LineaPlanilla, nombre: string): string[] {
  const errores: string[] = [];
  if (linea.bonificacion.isNegative()) {
    errores.push(`${nombre}: la bonificación no puede ser negativa`);
  }
  if (linea.otrosDescuentos.isNegative()) {
    errores.push(`${nombre}: los descuentos no pueden ser negativos`);
  }
  if (linea.liquido.isNegative()) {
    errores.push(
      `${nombre}: los descuentos (Q${linea.igss.add(linea.otrosDescuentos).toFixed(2)}) superan lo devengado (Q${linea.salarioBase.add(linea.bonificacion).toFixed(2)})`,
    );
  }
  return errores;
}

export function totalPlanilla(lineas: { liquido: Monto }[]): Decimal {
  return lineas.reduce<Decimal>((s, l) => s.add(new Decimal(l.liquido)), new Decimal(0));
}

/** Último día del mes (medianoche UTC), para incluir a quienes ingresaron durante el mes. */
export function finDeMes(anio: number, mes: number): Date {
  return new Date(Date.UTC(anio, mes, 0));
}
