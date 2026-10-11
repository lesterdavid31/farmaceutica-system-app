import type { Vigencia } from '@/lib/dominio';
import { formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/utils';

const FRANJA: Record<Vigencia, string> = {
  VIGENTE: 'border-l-verde-botica',
  POR_VENCER: 'border-l-ambar',
  VENCIDO: 'border-l-ladrillo',
};

const TEXTO_FECHA: Record<Vigencia, string> = {
  VIGENTE: 'text-texto-secundario',
  POR_VENCER: 'text-ambar',
  VENCIDO: 'text-ladrillo',
};

function leyenda(vigencia: Vigencia, dias: number) {
  if (vigencia === 'VENCIDO') {
    return dias === -1 ? 'venció ayer' : `venció hace ${-dias} días`;
  }
  if (vigencia === 'POR_VENCER') {
    return dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} días`;
  }
  return null;
}

/**
 * Etiqueta de lote (sección 8.1): inspirada en la etiqueta impresa de un frasco de farmacia.
 * Número de lote en negrita, vencimiento debajo y una franja izquierda de 3 px cuyo color
 * indica la vigencia. Es el único elemento visual "con personalidad" del sistema.
 */
export function EtiquetaLote({
  numeroLote,
  fechaVencimiento,
  vigencia,
  diasParaVencer,
  className,
}: {
  numeroLote: string;
  fechaVencimiento: string;
  vigencia: Vigencia;
  diasParaVencer: number;
  className?: string;
}) {
  const nota = leyenda(vigencia, diasParaVencer);
  return (
    <span
      className={cn(
        'inline-flex min-w-36 flex-col rounded-chip border border-l-3 border-borde bg-superficie py-1 pr-3 pl-2 leading-tight',
        FRANJA[vigencia],
        className,
      )}
    >
      <span className="text-denso font-semibold">Lote {numeroLote}</span>
      <span className={cn('text-meta tabular-nums', TEXTO_FECHA[vigencia])}>
        Vence {formatearFecha(fechaVencimiento)}
        {nota && ` · ${nota}`}
      </span>
    </span>
  );
}
