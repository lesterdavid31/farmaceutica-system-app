import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import { BadgeEstado } from '@/components/BadgeEstado';
import { EtiquetaLote } from '@/components/EtiquetaLote';
import {
  BarraFiltros,
  Campo,
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Paginacion,
  Panel,
  PanelError,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useListado, useMutacion } from '@/lib/consultas';
import {
  CANALES_VENTA,
  ESTADOS_VENTA,
  METODOS_PAGO,
  type EstadoVenta,
  type VentaDetalle,
  type VentaResumen,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { vigenciaLocal } from '@/lib/vigencia';
import { BotonCsv } from '@/components/BotonCsv';
import { descargarCsv, fechaCsv, obtenerTodas } from '@/lib/csv';

export function BadgeVenta({ estado }: { estado: EstadoVenta }) {
  return (
    <BadgeEstado tono={estado === 'ANULADA' ? 'peligro' : 'correcto'}>
      {ESTADOS_VENTA[estado]}
    </BadgeEstado>
  );
}

export function Ventas() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const [parametros, setParametros] = useSearchParams();
  const turnoCajaId = parametros.get('turnoCajaId') ?? '';
  const listado = useListado<
    VentaResumen,
    { q: string; estado: string; canal: string; desde: string; hasta: string }
  >(
    'ventas',
    { q: '', estado: '', canal: '', desde: '', hasta: '' },
    { extra: { ...(esGlobal(usuario) && { ubicacionId }), turnoCajaId } },
  );
  const mostrarUbicacion = esGlobal(usuario) && !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Ventas"
        descripcion="Historial de ventas con sus pagos. Abra una venta para ver su comprobante o anularla."
        acciones={
          usuario.rol === 'CAJERO' && (
            <Button variant="primario" onClick={() => navegar('/punto-de-venta')}>
              Ir al punto de venta
            </Button>
          )
        }
      />
      <Panel>
        {turnoCajaId && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde bg-acero-fondo px-4 py-2 text-denso">
            <span>Mostrando solo las ventas de un turno de caja.</span>
            <Button
              size="sm"
              variant="terciario"
              onClick={() =>
                setParametros(
                  (p) => {
                    const n = new URLSearchParams(p);
                    n.delete('turnoCajaId');
                    return n;
                  },
                  { replace: true },
                )
              }
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
              Quitar filtro
            </Button>
          </div>
        )}
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <Label htmlFor="f-q">Buscar</Label>
            <Input
              id="f-q"
              type="search"
              placeholder="Número o NIT"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <Label htmlFor="f-estado">Estado</Label>
            <Select
              id="f-estado"
              value={listado.filtros.estado}
              onChange={(e) => listado.setFiltro('estado', e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(ESTADOS_VENTA).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <Label htmlFor="f-canal">Canal</Label>
            <Select
              id="f-canal"
              value={listado.filtros.canal}
              onChange={(e) => listado.setFiltro('canal', e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(CANALES_VENTA).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-desde">Desde</Label>
            <Input
              id="f-desde"
              type="date"
              className="w-40"
              value={listado.filtros.desde}
              onChange={(e) => listado.setFiltro('desde', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-hasta">Hasta</Label>
            <Input
              id="f-hasta"
              type="date"
              className="w-40"
              value={listado.filtros.hasta}
              onChange={(e) => listado.setFiltro('hasta', e.target.value)}
            />
          </div>
          <div className="ml-auto self-end">
            <BotonCsv
              exportar={async () =>
                descargarCsv(
                  'ventas',
                  [
                    { titulo: 'Número', valor: (v) => v.numero },
                    { titulo: 'Fecha', valor: (v) => fechaCsv(v.createdAt) },
                    { titulo: 'Ubicación', valor: (v) => v.ubicacion.nombre },
                    { titulo: 'Canal', valor: (v) => CANALES_VENTA[v.canal] },
                    { titulo: 'NIT', valor: (v) => v.nit },
                    {
                      titulo: 'Pago',
                      valor: (v) => v.pagos.map((p) => METODOS_PAGO[p.metodo]).join(' + '),
                    },
                    { titulo: 'Total (Q)', valor: (v) => v.total },
                    { titulo: 'Estado', valor: (v) => ESTADOS_VENTA[v.estado] },
                    { titulo: 'Usuario', valor: (v) => v.usuario.nombre },
                  ],
                  await obtenerTodas<VentaResumen>('/ventas', {
                    ...listado.filtros,
                    ...(esGlobal(usuario) && { ubicacionId }),
                    turnoCajaId,
                  }),
                )
              }
            />
          </div>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio texto="No hay ventas con estos filtros." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha y hora</TableHead>
                  {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                  <TableHead>NIT</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead numerico>Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((v) => (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/ventas/${v.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/ventas/${v.id}`}
                        className="font-semibold text-verde-botica tabular-nums"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{v.numero}
                      </Link>
                      <span className="block text-meta text-texto-secundario">
                        {CANALES_VENTA[v.canal]}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatearFechaHora(v.createdAt)}
                      <span className="block text-meta text-texto-secundario">
                        {v.usuario.nombre}
                      </span>
                    </TableCell>
                    {mostrarUbicacion && <TableCell>{v.ubicacion.nombre}</TableCell>}
                    <TableCell className="tabular-nums">{v.nit}</TableCell>
                    <TableCell>{v.pagos.map((p) => METODOS_PAGO[p.metodo]).join(' + ')}</TableCell>
                    <TableCell numerico className="font-semibold whitespace-nowrap">
                      {formatearMoneda(v.total)}
                    </TableCell>
                    <TableCell>
                      <BadgeVenta estado={v.estado} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paginacion
              page={listado.page}
              limit={listado.limit}
              total={listado.data.total}
              onPage={listado.setPage}
            />
          </>
        )}
      </Panel>
    </Pagina>
  );
}

function FormularioAnulacion({
  venta,
  onTerminar,
}: {
  venta: VentaDetalle;
  onTerminar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const error =
    motivo.trim().length < 5
      ? 'Explique el motivo de la anulación (mínimo 5 caracteres)'
      : undefined;
  const anular = useMutacion(
    () => api.post(`/ventas/${venta.id}/anular`, { motivo: motivo.trim() }),
    {
      invalidar: [['ventas'], ['caja'], ['inventario']],
      exito: `Venta #${venta.numero} anulada`,
    },
  );
  const efectivo = venta.pagos
    .filter((p) => p.metodo === 'EFECTIVO')
    .reduce((s, p) => s + Number(p.monto), 0);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!error) {
          anular.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {anular.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={anular.error} />
        </div>
      )}
      <ul className="m-0 mb-4 list-disc pl-5 text-denso">
        <li>
          Las {venta.detalles.reduce((s, d) => s + d.cantidad, 0)} unidades vuelven a la existencia
          de {venta.ubicacion.nombre}, en los mismos lotes.
        </li>
        <li>
          Se registra la devolución de {formatearMoneda(venta.total)} en la caja del turno
          {efectivo > 0 && `; entregue ${formatearMoneda(efectivo)} en efectivo al cliente`}.
        </li>
        <li>La venta queda en el historial como anulada. No se puede deshacer.</li>
      </ul>
      <Campo id="motivoAnulacion" etiqueta="Motivo" error={enviado ? error : undefined}>
        <Textarea
          id="motivoAnulacion"
          autoFocus
          aria-invalid={enviado && !!error}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Campo>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Volver
        </Button>
        <Button type="submit" variant="destructivo" disabled={anular.isPending}>
          Anular venta
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DetalleVenta() {
  const { id } = useParams();
  const [anulando, setAnulando] = useState(false);
  const consulta = useQuery({
    queryKey: ['ventas', 'detalle', id],
    queryFn: () => api.get<VentaDetalle>(`/ventas/${id}`),
  });
  const venta = consulta.data;
  const turnoCerrado = venta?.turnoCaja?.estado === 'CERRADO';

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={venta ? `Venta #${venta.numero}` : 'Venta'}
        descripcion={venta && `${venta.ubicacion.nombre} · ${formatearFechaHora(venta.createdAt)}`}
        acciones={
          <>
            {venta?.puedeAnular && (
              <Button variant="destructivo" onClick={() => setAnulando(true)}>
                Anular venta
              </Button>
            )}
            {venta && (
              <Button asChild>
                <Link to={`/ventas/${venta.id}/comprobante`} target="_blank">
                  <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
                  Imprimir comprobante
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/ventas">Volver a ventas</Link>
            </Button>
          </>
        }
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
        venta && (
          <>
            <Panel className="mb-6">
              <dl className="m-0 grid gap-x-8 gap-y-3 p-4 text-denso sm:grid-cols-4">
                <div>
                  <dt className="text-texto-secundario">Estado</dt>
                  <dd className="m-0 mt-0.5">
                    <BadgeVenta estado={venta.estado} />
                  </dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Cajero</dt>
                  <dd className="m-0 font-semibold">{venta.usuario.nombre}</dd>
                  <dd className="m-0 text-meta text-texto-secundario">
                    {CANALES_VENTA[venta.canal]}
                  </dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">NIT</dt>
                  <dd className="m-0 font-semibold tabular-nums">{venta.nit}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Total</dt>
                  <dd className="m-0 text-seccion font-semibold tabular-nums">
                    {formatearMoneda(venta.total)}
                  </dd>
                </div>
                <div className="sm:col-span-4">
                  <dt className="text-texto-secundario">Pagos</dt>
                  <dd className="m-0">
                    {venta.pagos
                      .map(
                        (p) =>
                          `${METODOS_PAGO[p.metodo]} ${formatearMoneda(p.monto)}${p.referencia ? ` (autorización ${p.referencia})` : ''}`,
                      )
                      .join(' · ')}
                  </dd>
                </div>
                {venta.estado === 'ANULADA' && (
                  <div className="sm:col-span-4">
                    <dt className="text-texto-secundario">Anulación</dt>
                    <dd className="m-0">
                      {venta.motivoAnulacion}
                      <span className="block text-meta text-texto-secundario">
                        {venta.anuladaPor?.nombre} ·{' '}
                        {venta.fechaAnulacion && formatearFechaHora(venta.fechaAnulacion)}
                      </span>
                    </dd>
                  </div>
                )}
                {venta.estado === 'COMPLETADA' && turnoCerrado && (
                  <p className="m-0 text-meta text-texto-secundario sm:col-span-4">
                    El turno de caja de esta venta ya se cerró, así que no se puede anular.
                  </p>
                )}
              </dl>
            </Panel>
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote (FEFO)</TableHead>
                    <TableHead numerico>Cantidad</TableHead>
                    <TableHead numerico>Precio</TableHead>
                    <TableHead numerico>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venta.detalles.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-semibold">{d.producto.nombre}</span>
                        <span className="block text-meta text-texto-secundario">
                          {d.producto.sku} · {d.producto.presentacion}
                        </span>
                      </TableCell>
                      <TableCell>
                        <EtiquetaLote
                          numeroLote={d.lote.numeroLote}
                          fechaVencimiento={d.lote.fechaVencimiento}
                          {...vigenciaLocal(d.lote.fechaVencimiento)}
                        />
                      </TableCell>
                      <TableCell numerico>{d.cantidad}</TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(d.precioUnitario)}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(d.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-fondo hover:bg-fondo">
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell numerico className="font-semibold whitespace-nowrap">
                      {formatearMoneda(venta.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Panel>
            <Dialog open={anulando} onOpenChange={setAnulando}>
              {anulando && (
                <DialogContent titulo={`Anular venta #${venta.numero}`}>
                  <FormularioAnulacion venta={venta} onTerminar={() => setAnulando(false)} />
                </DialogContent>
              )}
            </Dialog>
          </>
        )
      )}
    </Pagina>
  );
}
