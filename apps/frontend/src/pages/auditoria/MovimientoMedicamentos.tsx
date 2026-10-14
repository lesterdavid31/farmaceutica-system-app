import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import { BotonCsv } from '@/components/BotonCsv';
import {
  BarraFiltros,
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Paginacion,
  Panel,
  PanelError,
} from '@/components/pagina';
import { SelectorProducto, type ProductoElegido } from '@/components/SelectorProducto';
import { Input, Label, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query, type Pagina as PaginaApi } from '@/lib/api';
import { descargarCsv, diaCsv, fechaCsv, obtenerTodas } from '@/lib/csv';
import { TIPOS_MOVIMIENTO, type TipoMovimientoInventario } from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

interface Movimiento {
  id: string;
  fecha: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  costoUnitario: string;
  valor: string;
  motivo: string | null;
  sku: string;
  producto: string;
  numero_lote: string;
  fecha_vencimiento: string;
  ubicacion: string;
  usuario: string;
}
type RespuestaMovimientos = PaginaApi<Movimiento> & {
  resumen: {
    tipo: TipoMovimientoInventario;
    movimientos: number;
    unidades: number;
    valor: string;
  }[];
};
interface RutaTraslado {
  origen: { id: string; nombre: string };
  destino: { id: string; nombre: string };
  traslados: number;
  recibidos: number;
  enTransito: number;
  pendientes: number;
  cancelados: number;
  unidadesEnviadas: number;
  unidadesRecibidas: number;
  faltanteRecepcion: number;
  valorEnviado: string;
}
interface ReporteTraslados {
  rutas: RutaTraslado[];
  totales: Omit<RutaTraslado, 'origen' | 'destino'>;
}

function primerDiaDelMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function KardexGlobal({
  desde,
  hasta,
  ubicacionId,
}: {
  desde: string;
  hasta: string;
  ubicacionId?: string;
}) {
  const [tipo, setTipo] = useState('');
  const [producto, setProducto] = useState<ProductoElegido | null>(null);
  const [page, setPage] = useState(1);
  const filtros = { desde, hasta, ubicacionId, tipo: tipo || undefined, productoId: producto?.id };
  const consulta = useQuery({
    queryKey: ['reportes', 'movimientos', filtros, page],
    queryFn: () =>
      api.get<RespuestaMovimientos>(
        `/reportes/movimientos${query({ ...filtros, page, limit: 30 })}`,
      ),
    placeholderData: (previo) => previo,
  });
  const r = consulta.data;
  const exportar = async () => {
    const filas = await obtenerTodas<Movimiento>('/reportes/movimientos', filtros);
    descargarCsv(
      'kardex-global',
      [
        { titulo: 'Fecha', valor: (m) => fechaCsv(m.fecha) },
        { titulo: 'Tipo', valor: (m) => TIPOS_MOVIMIENTO[m.tipo] },
        { titulo: 'SKU', valor: (m) => m.sku },
        { titulo: 'Producto', valor: (m) => m.producto },
        { titulo: 'Lote', valor: (m) => m.numero_lote },
        { titulo: 'Vencimiento', valor: (m) => diaCsv(m.fecha_vencimiento) },
        { titulo: 'Ubicación', valor: (m) => m.ubicacion },
        { titulo: 'Cantidad', valor: (m) => m.cantidad },
        { titulo: 'Costo unitario (Q)', valor: (m) => m.costoUnitario },
        { titulo: 'Valor (Q)', valor: (m) => m.valor },
        { titulo: 'Usuario', valor: (m) => m.usuario },
        { titulo: 'Detalle', valor: (m) => m.motivo },
      ],
      filas,
    );
  };
  return (
    <>
      <BarraFiltros>
        <div className="flex w-full flex-col gap-1 sm:w-80">
          <Label htmlFor="f-producto">Producto</Label>
          <SelectorProducto
            id="f-producto"
            valor={producto}
            onCambio={(p) => {
              setProducto(p);
              setPage(1);
            }}
            placeholder="Todos los productos"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-56">
          <Label htmlFor="f-tipo">Tipo de movimiento</Label>
          <Select
            id="f-tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(TIPOS_MOVIMIENTO).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto self-end">
          <BotonCsv exportar={exportar} deshabilitado={!r || r.total === 0} />
        </div>
      </BarraFiltros>
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.error ? (
        <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : r && r.total === 0 ? (
        <EstadoVacio texto="No hay movimientos con estos filtros." />
      ) : (
        r && (
          <>
            <div className="border-b border-borde">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resumen por tipo</TableHead>
                    <TableHead numerico>Movimientos</TableHead>
                    <TableHead numerico>Unidades</TableHead>
                    <TableHead numerico>Valor a costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.resumen.map((x) => (
                    <TableRow key={x.tipo}>
                      <TableCell>{TIPOS_MOVIMIENTO[x.tipo]}</TableCell>
                      <TableCell numerico>{x.movimientos}</TableCell>
                      <TableCell numerico className={cn(x.unidades < 0 && 'text-ladrillo')}>
                        {x.unidades > 0 ? `+${x.unidades}` : x.unidades}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(x.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead>Producto y lote</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead numerico>Cantidad</TableHead>
                  <TableHead numerico>Valor</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatearFechaHora(m.fecha)}
                    </TableCell>
                    <TableCell>{TIPOS_MOVIMIENTO[m.tipo]}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{m.producto}</span>
                      <span className="block text-meta text-texto-secundario">
                        {m.sku} · lote {m.numero_lote}
                      </span>
                    </TableCell>
                    <TableCell>{m.ubicacion}</TableCell>
                    <TableCell
                      numerico
                      className={cn(m.cantidad > 0 ? 'text-verde-botica' : 'text-texto')}
                    >
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(m.valor)}
                    </TableCell>
                    <TableCell className="min-w-48">
                      {m.motivo && <span className="block">{m.motivo}</span>}
                      <span className="block text-meta text-texto-secundario">{m.usuario}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paginacion page={page} limit={30} total={r.total} onPage={setPage} />
          </>
        )
      )}
    </>
  );
}

function TrasladosPorRuta({
  desde,
  hasta,
  ubicacionId,
}: {
  desde: string;
  hasta: string;
  ubicacionId?: string;
}) {
  const consulta = useQuery({
    queryKey: ['reportes', 'traslados', desde, hasta, ubicacionId],
    queryFn: () =>
      api.get<ReporteTraslados>(`/reportes/traslados${query({ desde, hasta, ubicacionId })}`),
  });
  const r = consulta.data;
  const celdas = (f: Omit<RutaTraslado, 'origen' | 'destino'>) => (
    <>
      <TableCell numerico>{f.traslados}</TableCell>
      <TableCell numerico>{f.recibidos}</TableCell>
      <TableCell numerico>{f.enTransito}</TableCell>
      <TableCell numerico>{f.pendientes}</TableCell>
      <TableCell numerico>{f.cancelados}</TableCell>
      <TableCell numerico>{f.unidadesEnviadas}</TableCell>
      <TableCell numerico className={cn(f.faltanteRecepcion > 0 && 'text-ladrillo')}>
        {f.faltanteRecepcion || '—'}
      </TableCell>
      <TableCell numerico className="whitespace-nowrap">
        {formatearMoneda(f.valorEnviado)}
      </TableCell>
    </>
  );
  return consulta.isPending ? (
    <Cargando />
  ) : consulta.error ? (
    <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
  ) : r && r.rutas.length === 0 ? (
    <EstadoVacio texto="No hay traslados solicitados en este período." />
  ) : (
    r && (
      <>
        <div className="flex justify-end border-b border-borde px-4 py-3">
          <BotonCsv
            tamano="sm"
            exportar={() =>
              descargarCsv(
                'traslados-por-ruta',
                [
                  { titulo: 'Origen', valor: (f) => f.origen.nombre },
                  { titulo: 'Destino', valor: (f) => f.destino.nombre },
                  { titulo: 'Traslados', valor: (f) => f.traslados },
                  { titulo: 'Recibidos', valor: (f) => f.recibidos },
                  { titulo: 'En tránsito', valor: (f) => f.enTransito },
                  { titulo: 'Pendientes', valor: (f) => f.pendientes },
                  { titulo: 'Cancelados', valor: (f) => f.cancelados },
                  { titulo: 'Unidades enviadas', valor: (f) => f.unidadesEnviadas },
                  { titulo: 'Unidades recibidas', valor: (f) => f.unidadesRecibidas },
                  { titulo: 'Faltante en recepción', valor: (f) => f.faltanteRecepcion },
                  { titulo: 'Valor enviado (Q)', valor: (f) => f.valorEnviado },
                ],
                r.rutas,
              )
            }
          />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>Origen → destino</TableHead>
                <TableHead numerico>Traslados</TableHead>
                <TableHead numerico>Recibidos</TableHead>
                <TableHead numerico>En tránsito</TableHead>
                <TableHead numerico>Pendientes</TableHead>
                <TableHead numerico>Cancelados</TableHead>
                <TableHead numerico>Unidades enviadas</TableHead>
                <TableHead numerico>Faltante recepción</TableHead>
                <TableHead numerico>Valor enviado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.rutas.map((f) => (
                <TableRow key={`${f.origen.id}-${f.destino.id}`}>
                  <TableCell>
                    {f.origen.nombre} <span className="text-texto-secundario">→</span>{' '}
                    <span className="font-semibold">{f.destino.nombre}</span>
                  </TableCell>
                  {celdas(f)}
                </TableRow>
              ))}
              <TableRow className="bg-fondo font-semibold hover:bg-fondo">
                <TableCell>Total</TableCell>
                {celdas(r.totales)}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </>
    )
  );
}

/** RF-34: movimiento de medicamentos: kardex global y traslados entre ubicaciones. */
export function MovimientoMedicamentos() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const [vista, setVista] = useState<'kardex' | 'traslados'>('kardex');
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoyLocal());
  const ubicacion = esGlobal(usuario) ? ubicacionId || undefined : undefined;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Movimiento de medicamentos"
        descripcion="Kardex de todos los productos y traslados entre ubicaciones en el período."
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-4 border-b border-borde p-4">
          <div className="flex gap-1" role="tablist" aria-label="Vista del reporte">
            {(
              [
                ['kardex', 'Kardex global'],
                ['traslados', 'Traslados por ruta'],
              ] as const
            ).map(([clave, etiqueta]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={vista === clave}
                onClick={() => setVista(clave)}
                className={cn(
                  'inline-flex h-10 items-center rounded-control border px-4 text-denso font-semibold',
                  vista === clave
                    ? 'border-verde-botica bg-salvia text-verde-botica'
                    : 'border-borde bg-superficie text-texto hover:bg-fondo',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
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
        </div>
        {vista === 'kardex' ? (
          <KardexGlobal desde={desde} hasta={hasta} ubicacionId={ubicacion} />
        ) : (
          <TrasladosPorRuta desde={desde} hasta={hasta} ubicacionId={ubicacion} />
        )}
      </Panel>
    </Pagina>
  );
}
