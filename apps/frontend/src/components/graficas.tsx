import { useSyncExternalStore, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatearMoneda } from '@/lib/formato';
import { COLORES, montoCorto, SERIES_METODO } from '@/lib/graficas';

const EJE = { fontSize: 12, fill: COLORES.textoSecundario };

const CONSULTA_ANGOSTA = '(max-width: 639px)';
/** Pantalla de celular: las etiquetas del eje de categorías se acortan para dejar sitio a las barras. */
function useAngosto() {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(CONSULTA_ANGOSTA);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(CONSULTA_ANGOSTA).matches,
    () => false,
  );
}

/** "Farmacia Plaza Magdalena" → "Plaza Magdalena" en pantallas angostas. */
const nombreCorto = (nombre: string) => nombre.replace(/^(Farmacia|Stand Gasolinera|Stand) /, '');

/** Contenedor del tooltip: panel blanco con borde y sombra de elemento flotante. */
function CajaTooltip({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-control border border-borde bg-superficie px-3 py-2 text-meta shadow-flotante">
      <p className="m-0 mb-1 font-semibold text-texto">{titulo}</p>
      {children}
    </div>
  );
}

function FilaTooltip({
  color,
  etiqueta,
  valor,
}: {
  color?: string;
  etiqueta: string;
  valor: string;
}) {
  return (
    <p className="m-0 flex items-center justify-between gap-4 text-texto">
      <span className="flex items-center gap-1.5 text-texto-secundario">
        {color && (
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ background: color }}
          />
        )}
        {etiqueta}
      </span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </p>
  );
}

/** Leyenda en HTML: cada serie con su muestra de color y su nombre en texto (nunca solo color). */
export function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-meta text-texto-secundario">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ background: s.color }}
          />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
};

/**
 * Las barras no se animan: la animación se reinicia cada vez que el contenedor cambia de tamaño y
 * deja las barras a medio crecer; además así se respeta a quien prefiere menos movimiento.
 */
/** Ventas por día: una sola serie (el título la nombra), barras delgadas con extremo redondeado. */
export function GraficaVentasDiarias({
  datos,
}: {
  datos: { dia: string; total: string; ventas: number }[];
}) {
  const filas = datos.map((d) => ({
    dia: d.dia.slice(0, 10),
    total: Number(d.total),
    ventas: d.ventas,
  }));
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Gráfica de ventas por día de los últimos 30 días"
    >
      <ResponsiveContainer>
        <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={COLORES.borde} />
          <XAxis
            dataKey="dia"
            tickFormatter={fechaCorta}
            tick={EJE}
            tickLine={false}
            axisLine={{ stroke: COLORES.borde }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickFormatter={montoCorto}
            tick={EJE}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: COLORES.salvia }}
            content={({ active, payload }) => {
              const f = payload?.[0]?.payload as (typeof filas)[number] | undefined;
              return active && f ? (
                <CajaTooltip titulo={fechaCorta(f.dia)}>
                  <FilaTooltip etiqueta="Ventas" valor={formatearMoneda(f.total)} />
                  <FilaTooltip etiqueta="Transacciones" valor={String(f.ventas)} />
                </CajaTooltip>
              ) : null;
            }}
          />
          <Bar
            dataKey="total"
            fill={COLORES.serie1}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ingresos por sucursal apilados por método de pago (3 series, orden fijo). Barras horizontales
 * para que los nombres de sucursal se lean completos; 2 px de separación entre segmentos y el total
 * como etiqueta directa al final de cada barra.
 */
export function GraficaIngresosPorMetodo({
  filas,
}: {
  filas: { ubicacion: { id: string; nombre: string }; porMetodo: Record<string, string> }[];
}) {
  const datos = filas.map((f) => {
    const valores = Object.fromEntries(
      SERIES_METODO.map((s) => [s.clave, Math.max(0, Number(f.porMetodo[s.clave] ?? 0))]),
    );
    return {
      nombre: f.ubicacion.nombre,
      ...valores,
      total: SERIES_METODO.reduce((s, x) => s + Number(f.porMetodo[x.clave] ?? 0), 0),
    };
  });
  const angosto = useAngosto();
  const alto = Math.max(140, datos.length * 40 + 48);
  return (
    <div className="flex flex-col gap-3">
      <Leyenda series={SERIES_METODO.map((s) => ({ nombre: s.nombre, color: s.color }))} />
      <div
        style={{ height: alto }}
        className="w-full"
        role="img"
        aria-label="Gráfica de ingresos por sucursal y método de pago"
      >
        <ResponsiveContainer>
          <BarChart
            data={datos}
            layout="vertical"
            margin={{ top: 0, right: angosto ? 52 : 72, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} stroke={COLORES.borde} />
            <XAxis
              type="number"
              tickFormatter={montoCorto}
              tick={EJE}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="nombre"
              tick={EJE}
              tickFormatter={angosto ? nombreCorto : undefined}
              tickLine={false}
              axisLine={false}
              width={angosto ? 96 : 190}
            />
            <Tooltip
              cursor={{ fill: COLORES.salvia }}
              content={({ active, payload }) => {
                const f = payload?.[0]?.payload as (typeof datos)[number] | undefined;
                return active && f ? (
                  <CajaTooltip titulo={f.nombre}>
                    {SERIES_METODO.map((s) => (
                      <FilaTooltip
                        key={s.clave}
                        color={s.color}
                        etiqueta={s.nombre}
                        valor={formatearMoneda(
                          Number((f as unknown as Record<string, number>)[s.clave]),
                        )}
                      />
                    ))}
                    <FilaTooltip etiqueta="Total" valor={formatearMoneda(f.total)} />
                  </CajaTooltip>
                ) : null;
              }}
            />
            {SERIES_METODO.map((s, i) => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                stackId="metodo"
                isAnimationActive={false}
                fill={s.color}
                stroke={COLORES.superficie}
                strokeWidth={2}
                maxBarSize={22}
                radius={i === SERIES_METODO.length - 1 ? [0, 4, 4, 0] : 0}
              >
                {i === SERIES_METODO.length - 1 && (
                  <LabelList
                    dataKey="total"
                    position="right"
                    formatter={(v: unknown) => montoCorto(Number(v))}
                    style={{ fontSize: 12, fill: COLORES.texto }}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
