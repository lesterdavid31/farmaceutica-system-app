import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import { BotonCsv } from '@/components/BotonCsv';
import { GraficaIngresosPorMetodo } from '@/components/graficas';
import { SERIES_METODO } from '@/lib/graficas';
import {
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Panel,
  PanelError,
} from '@/components/pagina';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query } from '@/lib/api';
import { descargarCsv, fechaCsv } from '@/lib/csv';
import { formatearFecha, formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { BadgeDiferencia } from '@/pages/caja/componentes';

type Metodos = Record<'EFECTIVO' | 'TARJETA' | 'CONTRA_ENTREGA', string>;
interface FilaFlujo {
  ubicacion: { id: string; nombre: string };
  ingresos: Metodos;
  totalIngresos: string;
  depositos: string;
  gastos: string;
  retiros: string;
  netoEfectivo: string;
  turnosCerrados: number;
  sobrantes: string;
  faltantes: string;
}
interface Flujo {
  desde: string;
  hasta: string;
  consolidado: Omit<FilaFlujo, 'ubicacion'>;
  porSucursal: FilaFlujo[];
  turnos: {
    id: string;
    estado: 'ABIERTO' | 'CERRADO';
    apertura: string;
    cierre: string | null;
    montoInicial: string;
    efectivoEsperado: string | null;
    efectivoContado: string | null;
    diferencia: string | null;
    cajero: { nombre: string };
    ubicacion: { id: string; nombre: string };
  }[];
}

function hoyLocal(dia = 0) {
  const d = new Date();
  if (dia) {
    d.setDate(dia);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const COLUMNAS_FLUJO = [
  { titulo: 'Ubicación', valor: (f: FilaFlujo) => f.ubicacion.nombre },
  ...SERIES_METODO.map((s) => ({
    titulo: `Ingresos ${s.nombre.toLowerCase()} (Q)`,
    valor: (f: FilaFlujo) => f.ingresos[s.clave],
  })),
  { titulo: 'Total ingresos (Q)', valor: (f: FilaFlujo) => f.totalIngresos },
  { titulo: 'Depósitos (Q)', valor: (f: FilaFlujo) => f.depositos },
  { titulo: 'Gastos (Q)', valor: (f: FilaFlujo) => f.gastos },
  { titulo: 'Retiros (Q)', valor: (f: FilaFlujo) => f.retiros },
  { titulo: 'Neto en efectivo (Q)', valor: (f: FilaFlujo) => f.netoEfectivo },
  { titulo: 'Turnos cerrados', valor: (f: FilaFlujo) => f.turnosCerrados },
  { titulo: 'Sobrantes (Q)', valor: (f: FilaFlujo) => f.sobrantes },
  { titulo: 'Faltantes (Q)', valor: (f: FilaFlujo) => f.faltantes },
];

function Celdas({ f }: { f: Omit<FilaFlujo, 'ubicacion'> }) {
  const m = (v: string) => formatearMoneda(v);
  return (
    <>
      {SERIES_METODO.map((s) => (
        <TableCell key={s.clave} numerico className="whitespace-nowrap">
          {m(f.ingresos[s.clave])}
        </TableCell>
      ))}
      <TableCell numerico className="whitespace-nowrap">
        {m(f.depositos)}
      </TableCell>
      <TableCell numerico className="whitespace-nowrap">
        {m(f.gastos)}
      </TableCell>
      <TableCell numerico className="whitespace-nowrap">
        {m(f.retiros)}
      </TableCell>
      <TableCell numerico className="font-semibold whitespace-nowrap">
        {m(f.netoEfectivo)}
      </TableCell>
      <TableCell numerico className="whitespace-nowrap text-ambar">
        {Number(f.sobrantes) ? m(f.sobrantes) : '—'}
      </TableCell>
      <TableCell numerico className="whitespace-nowrap text-ladrillo">
        {Number(f.faltantes) ? m(f.faltantes) : '—'}
      </TableCell>
    </>
  );
}

/** RF-33: flujo de efectivo consolidado y por sucursal, con diferencias de arqueo y turnos. */
export function FlujoEfectivo() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const [desde, setDesde] = useState(hoyLocal(1));
  const [hasta, setHasta] = useState(hoyLocal());
  const consulta = useQuery({
    queryKey: ['reportes', 'flujo', desde, hasta, ubicacionId],
    queryFn: () =>
      api.get<Flujo>(
        `/reportes/flujo-efectivo${query({ desde, hasta, ubicacionId: esGlobal(usuario) ? ubicacionId : undefined })}`,
      ),
    enabled: desde !== '' && hasta !== '' && desde <= hasta,
  });
  const r = consulta.data;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Flujo de efectivo"
        descripcion="Ingresos por método, egresos y diferencias de arqueo de las cajas en el período (hora de Guatemala)."
      />
      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="desde">Desde</Label>
            <Input
              id="desde"
              type="date"
              className="w-44"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="hasta">Hasta</Label>
            <Input
              id="hasta"
              type="date"
              className="w-44"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          {desde > hasta && (
            <p className="m-0 pb-2 text-meta text-ladrillo">
              La fecha inicial es posterior a la final.
            </p>
          )}
        </div>
        {r && (
          <div className="grid grid-cols-2 divide-borde border-t border-borde sm:grid-cols-3 sm:divide-x xl:grid-cols-6">
            {[
              ['Ingresos totales', r.consolidado.totalIngresos, 'Ventas y cobros netos'],
              ['Efectivo', r.consolidado.ingresos.EFECTIVO, 'Ventas de mostrador'],
              ['Tarjeta', r.consolidado.ingresos.TARJETA, 'No pasa por la gaveta'],
              [
                'Egresos',
                String(Number(r.consolidado.gastos) + Number(r.consolidado.retiros)),
                'Gastos y retiros',
              ],
              ['Neto en efectivo', r.consolidado.netoEfectivo, 'Entradas − salidas de gaveta'],
              [
                'Diferencias de arqueo',
                String(Number(r.consolidado.sobrantes) - Number(r.consolidado.faltantes)),
                `${r.consolidado.turnosCerrados} turnos cerrados`,
              ],
            ].map(([etiqueta, valor, detalle]) => (
              <div key={etiqueta} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-meta text-texto-secundario">{etiqueta}</span>
                <span className="text-seccion font-semibold tabular-nums">
                  {formatearMoneda(valor)}
                </span>
                <span className="text-meta text-texto-secundario">{detalle}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {consulta.isPending ? (
        <Panel>
          <Cargando />
        </Panel>
      ) : consulta.error ? (
        <Panel>
          <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
        </Panel>
      ) : r && r.porSucursal.length === 0 ? (
        <Panel>
          <EstadoVacio texto="No hay movimientos de caja en este período." />
        </Panel>
      ) : (
        r && (
          <div className="flex flex-col gap-6">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
                <h2 className="m-0 text-seccion font-semibold">Por sucursal</h2>
                <BotonCsv
                  tamano="sm"
                  exportar={() =>
                    descargarCsv('flujo-de-efectivo', COLUMNAS_FLUJO, [
                      ...r.porSucursal,
                      { ...r.consolidado, ubicacion: { id: '', nombre: 'Consolidado' } },
                    ])
                  }
                />
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ubicación</TableHead>
                      {SERIES_METODO.map((s) => (
                        <TableHead key={s.clave} numerico>
                          {s.nombre}
                        </TableHead>
                      ))}
                      <TableHead numerico>Depósitos</TableHead>
                      <TableHead numerico>Gastos</TableHead>
                      <TableHead numerico>Retiros</TableHead>
                      <TableHead numerico>Neto efectivo</TableHead>
                      <TableHead numerico>Sobrantes</TableHead>
                      <TableHead numerico>Faltantes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.porSucursal.map((f) => (
                      <TableRow key={f.ubicacion.id}>
                        <TableCell className="font-semibold">{f.ubicacion.nombre}</TableCell>
                        <Celdas f={f} />
                      </TableRow>
                    ))}
                    <TableRow className="bg-fondo font-semibold hover:bg-fondo">
                      <TableCell>Consolidado</TableCell>
                      <Celdas f={r.consolidado} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-borde p-4">
                <h3 className="m-0 mb-3 text-denso font-semibold">
                  Ingresos por sucursal y método
                </h3>
                <GraficaIngresosPorMetodo
                  filas={r.porSucursal.map((f) => ({
                    ubicacion: f.ubicacion,
                    porMetodo: f.ingresos,
                  }))}
                />
              </div>
            </Panel>
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
                <h2 className="m-0 text-seccion font-semibold">Turnos de caja del período</h2>
                <BotonCsv
                  tamano="sm"
                  exportar={() =>
                    descargarCsv(
                      'turnos-de-caja',
                      [
                        { titulo: 'Ubicación', valor: (t) => t.ubicacion.nombre },
                        { titulo: 'Cajero', valor: (t) => t.cajero.nombre },
                        { titulo: 'Apertura', valor: (t) => fechaCsv(t.apertura) },
                        { titulo: 'Cierre', valor: (t) => fechaCsv(t.cierre) },
                        { titulo: 'Monto inicial (Q)', valor: (t) => t.montoInicial },
                        { titulo: 'Esperado (Q)', valor: (t) => t.efectivoEsperado },
                        { titulo: 'Contado (Q)', valor: (t) => t.efectivoContado },
                        { titulo: 'Diferencia (Q)', valor: (t) => t.diferencia },
                      ],
                      r.turnos,
                    )
                  }
                />
              </div>
              {r.turnos.length === 0 ? (
                <EstadoVacio texto="No hay turnos en este período." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Apertura</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Cajero</TableHead>
                      <TableHead numerico>Esperado</TableHead>
                      <TableHead numerico>Contado</TableHead>
                      <TableHead>Arqueo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.turnos.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          <Link
                            to={`/caja/turnos/${t.id}`}
                            className="font-semibold text-verde-botica"
                          >
                            {formatearFechaHora(t.apertura)}
                          </Link>
                        </TableCell>
                        <TableCell>{t.ubicacion.nombre}</TableCell>
                        <TableCell>{t.cajero.nombre}</TableCell>
                        <TableCell numerico className="whitespace-nowrap">
                          {t.efectivoEsperado ? formatearMoneda(t.efectivoEsperado) : ''}
                        </TableCell>
                        <TableCell numerico className="whitespace-nowrap">
                          {t.efectivoContado ? formatearMoneda(t.efectivoContado) : ''}
                        </TableCell>
                        <TableCell>
                          <BadgeDiferencia diferencia={t.diferencia} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="m-0 border-t border-borde px-4 py-2 text-meta text-texto-secundario">
                Período del {formatearFecha(r.desde)} al {formatearFecha(r.hasta)}. Las diferencias
                de arqueo cuentan los turnos cerrados en el período.
              </p>
            </Panel>
          </div>
        )
      )}
    </Pagina>
  );
}
