import type { Vigencia } from './dominio';

/** Calcula vigencia y días para lotes que la API no clasifica (por ejemplo, en el kardex). */
export function vigenciaLocal(fechaVencimiento: string, diasAlerta = 90) {
  const hoy = new Date();
  const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((new Date(fechaVencimiento).getTime() - hoyUtc) / 86_400_000);
  const vigencia: Vigencia = dias < 0 ? 'VENCIDO' : dias <= diasAlerta ? 'POR_VENCER' : 'VIGENTE';
  return { vigencia, diasParaVencer: dias };
}
