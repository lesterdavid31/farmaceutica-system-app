import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import { BotonCsv } from '@/components/BotonCsv';
import { GraficaIngresosPorMetodo, GraficaVentasDiarias } from '@/components/graficas';
import { SERIES_METODO } from '@/lib/graficas';
import { Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query } from '@/lib/api';
import { descargarCsv } from '@/lib/csv';
import { MESES, ROLES } from '@/lib/dominio';
import { formatearFecha, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

export interface DatosDashboard {
  ubicacionId: string | null;
  fecha: string;
  ventas: Record<'hoy' | 'mes' | 'anio', { total: string; cantidad: number }>;
  ventasPorDia: { dia: string; total: string; ventas: number }[];
  flujoPorSucursal: {
    ubicacion: { id: string; nombre: string };
    ventas: number;
    totalVentas: string;
    porMetodo: Record<string, string>;
    totalIngresos: string;
  }[];
  flujoPorMetodo: Record<string, string>;
  pedidosAtrasados: {
    total: number;
    lista: {
      id: string;
      numero: number;
      minutosAtraso: number;
      cliente: { nombre: string };
      ubicacionDespacho: { nombre: string };
    }[];
  };
  alertas: { vencidos: number; porVencer: number; bajoMinimo: number };
  inventario: { valorCosto: string; valorVigente: string; unidades: number };
  activos: { cantidad: number; valorEnLibros: string };
  planilla: {
    anio: number;
    mes: number;
    totalMes: string;
    cerradasMes: number;
    ultimoCierre: { anio: number; mes: number; total: string; planillas: number } | null;
  };
  cajasConDiferencia: {
    id: string;
    cierre: string;
    diferencia: string;
    cajero: { nombre: string };
    ubicacion: { nombre: string };
  }[];
}

const atraso = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** "Requiere atención hoy": solo lo pendiente, con enlace directo (sección 8.1). */
function RequiereAtencion({ d }: { d: DatosDashboard }) {
  const items: {
    clave: string;
    texto: ReactNode;
    detalle?: ReactNode;
    ruta: string;
    grave: boolean;
  }[] = [];
  if (d.pedidosAtrasados.total > 0) {
    items.push({
      clave: 'pedidos',
      texto: `${d.pedidosAtrasados.total} ${d.pedidosAtrasados.total === 1 ? 'pedido atrasado' : 'pedidos atrasados'}`,
      detalle: d.pedidosAtrasados.lista
        .slice(0, 3)
        .map((p) => `#${p.numero} ${p.ubicacionDespacho.nombre} (${atraso(p.minutosAtraso)})`)
        .join(' · '),
      ruta: '/pedidos',
      grave: true,
    });
  }
  if (d.alertas.vencidos > 0) {
    items.push({
      clave: 'vencidos',
      texto: `${d.alertas.vencidos} ${d.alertas.vencidos === 1 ? 'lote vencido' : 'lotes vencidos'} pendientes de baja`,
      ruta: '/inventario/alertas',
      grave: true,
    });
  }
  if (d.cajasConDiferencia.length > 0) {
    items.push({
      clave: 'cajas',
      texto: `${d.cajasConDiferencia.length} ${d.cajasConDiferencia.length === 1 ? 'caja cerró' : 'cajas cerraron'} con diferencia en los últimos 7 días`,
      detalle: d.cajasConDiferencia
        .slice(0, 3)
        .map((c) => `${c.ubicacion.nombre} ${formatearMoneda(c.diferencia)}`)
        .join(' · '),
      ruta: '/caja/turnos',
      grave: d.cajasConDiferencia.some((c) => Number(c.diferencia) < 0),
    });
  }
  if (d.alertas.porVencer > 0) {
    items.push({
      clave: 'porVencer',
      texto: `${d.alertas.porVencer} ${d.alertas.porVencer === 1 ? 'lote por vencer' : 'lotes por vencer'}`,
      ruta: '/inventario/alertas',
      grave: false,
    });
  }
  if (d.alertas.bajoMinimo > 0) {
    items.push({
      clave: 'minimo',
      texto: `${d.alertas.bajoMinimo} ${d.alertas.bajoMinimo === 1 ? 'producto' : 'productos'} bajo el stock mínimo`,
      ruta: '/inventario/alertas',
      grave: false,
    });
  }
  return (
    <Panel className="mb-6">
      <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
        Requiere atención hoy
      </h2>
      {items.length === 0 ? (
        <p className="m-0 flex items-center gap-2 px-4 py-4 text-denso text-verde-botica">
          <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
          Todo en orden: no hay pendientes.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((i) => (
            <li key={i.clave} className="border-b border-borde last:border-b-0">
              <Link
                to={i.ruta}
                className="flex items-center gap-3 px-4 py-2.5 text-denso text-texto no-underline hover:bg-salvia/50"
              >
                <AlertTriangle
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={cn('shrink-0', i.grave ? 'text-ladrillo' : 'text-ambar')}
                />
                <span className="flex-1">
                  <span className="font-semibold">{i.texto}</span>
                  {i.detalle && (
                    <span className="block text-meta text-texto-secundario">{i.detalle}</span>
                  )}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="text-texto-secundario"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Indicador({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-meta text-texto-secundario">{etiqueta}</span>
      <span className="text-cuerpo font-semibold whitespace-nowrap tabular-nums sm:text-seccion">
        {valor}
      </span>
      {detalle && <span className="text-meta text-texto-secundario">{detalle}</span>}
    </div>
  );
}

/** Franja de indicadores en un solo panel con separadores (no tarjetas sueltas). */
function Indicadores({ d }: { d: DatosDashboard }) {
  const planilla =
    d.planilla.cerradasMes > 0
      ? { valor: d.planilla.totalMes, detalle: `${MESES[d.planilla.mes - 1]} ${d.planilla.anio}` }
      : d.planilla.ultimoCierre
        ? {
            valor: d.planilla.ultimoCierre.total,
            detalle: `Último cierre: ${MESES[d.planilla.ultimoCierre.mes - 1].toLowerCase()} ${d.planilla.ultimoCierre.anio}`,
          }
        : { valor: '0', detalle: 'Sin planillas cerradas' };
  return (
    <Panel className="mb-6">
      <div className="grid grid-cols-2 divide-borde sm:grid-cols-3 sm:divide-x xl:grid-cols-6">
        <Indicador
          etiqueta="Ventas de hoy"
          valor={formatearMoneda(d.ventas.hoy.total)}
          detalle={`${d.ventas.hoy.cantidad} ventas`}
        />
        <Indicador
          etiqueta="Ventas del mes"
          valor={formatearMoneda(d.ventas.mes.total)}
          detalle={`${d.ventas.mes.cantidad} ventas`}
        />
        <Indicador
          etiqueta="Ventas del año"
          valor={formatearMoneda(d.ventas.anio.total)}
          detalle={`${d.ventas.anio.cantidad} ventas`}
        />
        <Indicador
          etiqueta="Inventario a costo"
          valor={formatearMoneda(d.inventario.valorCosto)}
          detalle={`Vigente ${formatearMoneda(d.inventario.valorVigente)}`}
        />
        <Indicador
          etiqueta="Activos (valor en libros)"
          valor={formatearMoneda(d.activos.valorEnLibros)}
          detalle={`${d.activos.cantidad} activos`}
        />
        <Indicador
          etiqueta="Gasto en planilla"
          valor={formatearMoneda(planilla.valor)}
          detalle={planilla.detalle}
        />
      </div>
    </Panel>
  );
}

/** Panel de gráfica con su tabla equivalente (accesibilidad) y exportación a CSV. */
function PanelGrafica({
  titulo,
  descripcion,
  grafica,
  tabla,
  onExportar,
}: {
  titulo: string;
  descripcion: string;
  grafica: ReactNode;
  tabla: ReactNode;
  onExportar: () => void;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <Panel className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-borde px-4 py-3">
        <div>
          <h2 className="m-0 text-seccion font-semibold">{titulo}</h2>
          <p className="m-0 mt-0.5 text-meta text-texto-secundario">{descripcion}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="terciario"
            aria-pressed={verTabla}
            onClick={() => setVerTabla((v) => !v)}
          >
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </Button>
          <BotonCsv tamano="sm" exportar={onExportar} />
        </div>
      </div>
      <div className={verTabla ? '' : 'p-4'}>{verTabla ? tabla : grafica}</div>
    </Panel>
  );
}

/**
 * Dashboard ejecutivo (ADMIN y AUDITOR, filtrable por ubicación en la barra superior) y de
 * sucursal (GERENTE, su ubicación): RF-32 y RF-37.
 */
export function Dashboard() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const global = esGlobal(usuario);
  const consulta = useQuery({
    queryKey: ['reportes', 'dashboard', global ? ubicacionId : usuario.ubicacion?.id],
    queryFn: () =>
      api.get<DatosDashboard>(
        `/reportes/dashboard${query({ ubicacionId: global ? ubicacionId : undefined })}`,
      ),
    // Los atrasos se calculan al consultar: se refresca cada minuto mientras la pantalla está abierta.
    refetchInterval: 60_000,
  });
  const d = consulta.data;
  const sucursal = global
    ? ubicacionId
      ? 'una ubicación'
      : 'todas las ubicaciones'
    : usuario.ubicacion?.nombre;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={global ? 'Dashboard ejecutivo' : `Dashboard de ${usuario.ubicacion?.nombre}`}
        descripcion={`${ROLES[usuario.rol]} · ${sucursal}${d ? ` · ${formatearFecha(d.fecha)}` : ''}`}
      />
      {consulta.isPending ? (
        <Panel>
          <Cargando />
        </Panel>
      ) : consulta.error ? (
        <Panel>
          <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
        </Panel>
      ) : (
        d && (
          <>
            <RequiereAtencion d={d} />
            <Indicadores d={d} />
            <div className="grid gap-6 2xl:grid-cols-2">
              <PanelGrafica
                titulo="Ventas por día"
                descripcion="Ventas completadas de los últimos 30 días"
                grafica={<GraficaVentasDiarias datos={d.ventasPorDia} />}
                onExportar={() =>
                  descargarCsv(
                    'ventas-por-dia',
                    [
                      { titulo: 'Fecha', valor: (f) => f.dia.slice(0, 10) },
                      { titulo: 'Ventas', valor: (f) => f.ventas },
                      { titulo: 'Total (Q)', valor: (f) => f.total },
                    ],
                    d.ventasPorDia,
                  )
                }
                tabla={
                  <div className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead numerico>Ventas</TableHead>
                          <TableHead numerico>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...d.ventasPorDia].reverse().map((f) => (
                          <TableRow key={f.dia}>
                            <TableCell className="tabular-nums">{formatearFecha(f.dia)}</TableCell>
                            <TableCell numerico>{f.ventas}</TableCell>
                            <TableCell numerico>{formatearMoneda(f.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                }
              />
              <PanelGrafica
                titulo="Ingresos del mes por sucursal"
                descripcion="Ventas y cobros de pedidos menos anulaciones, por método de pago"
                grafica={
                  d.flujoPorSucursal.length === 0 ? (
                    <p className="m-0 text-denso text-texto-secundario">
                      Aún no hay ingresos este mes.
                    </p>
                  ) : (
                    <GraficaIngresosPorMetodo filas={d.flujoPorSucursal} />
                  )
                }
                onExportar={() =>
                  descargarCsv(
                    'ingresos-por-sucursal',
                    [
                      { titulo: 'Sucursal', valor: (f) => f.ubicacion.nombre },
                      { titulo: 'Ventas', valor: (f) => f.ventas },
                      { titulo: 'Total ventas (Q)', valor: (f) => f.totalVentas },
                      ...SERIES_METODO.map((s) => ({
                        titulo: `${s.nombre} (Q)`,
                        valor: (f: DatosDashboard['flujoPorSucursal'][number]) =>
                          f.porMetodo[s.clave],
                      })),
                      { titulo: 'Total ingresos (Q)', valor: (f) => f.totalIngresos },
                    ],
                    d.flujoPorSucursal,
                  )
                }
                tabla={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sucursal</TableHead>
                        {SERIES_METODO.map((s) => (
                          <TableHead key={s.clave} numerico>
                            {s.nombre}
                          </TableHead>
                        ))}
                        <TableHead numerico>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.flujoPorSucursal.map((f) => (
                        <TableRow key={f.ubicacion.id}>
                          <TableCell>{f.ubicacion.nombre}</TableCell>
                          {SERIES_METODO.map((s) => (
                            <TableCell key={s.clave} numerico className="whitespace-nowrap">
                              {formatearMoneda(f.porMetodo[s.clave])}
                            </TableCell>
                          ))}
                          <TableCell numerico className="font-semibold whitespace-nowrap">
                            {formatearMoneda(f.totalIngresos)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-fondo font-semibold hover:bg-fondo">
                        <TableCell>Total</TableCell>
                        {SERIES_METODO.map((s) => (
                          <TableCell key={s.clave} numerico className="whitespace-nowrap">
                            {formatearMoneda(d.flujoPorMetodo[s.clave])}
                          </TableCell>
                        ))}
                        <TableCell numerico className="whitespace-nowrap">
                          {formatearMoneda(
                            SERIES_METODO.reduce(
                              (s, x) => s + Number(d.flujoPorMetodo[x.clave]),
                              0,
                            ),
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                }
              />
            </div>
          </>
        )
      )}
    </Pagina>
  );
}
