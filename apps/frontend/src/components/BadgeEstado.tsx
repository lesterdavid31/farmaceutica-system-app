import type { ReactNode } from 'react';

export type TonoEstado = 'correcto' | 'advertencia' | 'peligro' | 'proceso' | 'neutro';

const clasesPorTono: Record<TonoEstado, string> = {
  correcto: 'bg-salvia text-verde-botica',
  advertencia: 'bg-ambar-fondo text-ambar',
  peligro: 'bg-ladrillo-fondo text-ladrillo',
  proceso: 'bg-acero-fondo text-acero',
  neutro: 'bg-fondo text-texto-secundario',
};

export function BadgeEstado({ tono, children }: { tono: TonoEstado; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-0.5 text-meta font-semibold ${clasesPorTono[tono]}`}
    >
      {children}
    </span>
  );
}
