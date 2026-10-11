import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, PackageCheck, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EtiquetaLote } from '@/components/EtiquetaLote';
import { Campo, Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import {
  ESTADOS_TRASLADO,
  MOTIVOS_TRASLADO,
  TIPOS_UBICACION,
  type DetalleTraslado as FilaTraslado,
  type TrasladoDetalle,
} from '@/lib/dominio';
import { formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { vigenciaLocal } from '@/lib/vigencia';
import { BadgeTraslado } from './Traslados';

const INVALIDAR = [['traslados'], ['inventario']];

// ─── Recepción ────────────────────────────────────────────────────────────────

function FormularioRecepcion({
  traslado,
  onTerminar,
}: {
  traslado: TrasladoDetalle;
  onTerminar: () => void;
}) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(traslado.detalles.map((d) => [d.id, String(d.cantidadEnviada ?? 0)])),
  );
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);

  const filas = traslado.detalles.map((d) => {
    const texto = cantidades[d.id] ?? '';
    const valida = /^\d+$/.test(texto.trim());
    const recibida = valida ? Number(texto) : NaN;
    const enviada = d.cantidadEnviada ?? 0;
    const error = !valida
      ? 'Ingrese un número entero'
      : recibida > enviada
        ? `Se despacharon ${enviada}`
        : undefined;
    return { d, recibida, enviada, error };
  });
  const faltante = filas.reduce(
    (s, f) => s + (f.error ? 0 : Math.max(0, f.enviada - f.recibida)),
    0,
  );
  const errorMotivo =
    faltante > 0 && motivo.trim().length < 5
      ? 'Explique la diferencia (mínimo 5 caracteres)'
      : undefined;

  const recibir = useMutacion(
    () =>
      api.post(`/traslados/${traslado.id}/recibir`, {
        detalles: filas.map((f) => ({ detalleId: f.d.id, cantidadRecibida: f.recibida })),
        motivoDiferencia: faltante > 0 ? motivo.trim() : undefined,
      }),
    { invalidar: INVALIDAR, exito: `Traslado #${traslado.numero} recibido` },
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (filas.some((f) => f.error) || errorMotivo) {
          return;
        }
        recibir.mutate(undefined, { onSuccess: onTerminar });
      }}
    >
      {recibir.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={recibir.error} />
        </div>
      )}
      <p className="m-0 mb-4 text-denso">
        Cuente lo que llegó. Si hay diferencias con lo despachado, quedarán registradas como ajuste
        en el kardex de {traslado.destino.nombre}.
      </p>
      <div className="-mx-6 mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto y lote</TableHead>
              <TableHead numerico>Despachado</TableHead>
              <TableHead numerico>Recibido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ d, enviada, recibida, error }) => (
              <TableRow key={d.id}>
                <TableCell>
                  <span className="block font-semibold">{d.producto.nombre}</span>
                  <span className="text-meta text-texto-secundario">Lote {d.lote?.numeroLote}</span>
                </TableCell>
                <TableCell numerico>{enviada}</TableCell>
                <TableCell numerico className="w-32">
                  <Input
                    inputMode="numeric"
                    aria-label={`Recibido de ${d.producto.nombre}, lote ${d.lote?.numeroLote}`}
                    aria-invalid={enviado && !!error}
                    className={cn(
                      'text-right tabular-nums',
                      !error && recibida < enviada && 'border-ambar',
                    )}
                    value={cantidades[d.id]}
                    onChange={(e) => setCantidades((c) => ({ ...c, [d.id]: e.target.value }))}
                  />
                  {enviado && error && (
                    <p role="alert" className="m-0 mt-1 text-meta text-ladrillo">
                      {error}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {faltante > 0 && (
        <Campo
          id="motivoDiferencia"
          etiqueta={`Motivo de la diferencia (faltan ${faltante} ${faltante === 1 ? 'unidad' : 'unidades'})`}
          error={enviado ? errorMotivo : undefined}
        >
          <Textarea
            id="motivoDiferencia"
            placeholder="Por ejemplo: una caja llegó abierta y vacía"
            aria-invalid={enviado && !!errorMotivo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      )}
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={recibir.isPending}>
          Recibir traslado
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Cancelación ──────────────────────────────────────────────────────────────

function FormularioCancelacion({
  traslado,
  onTerminar,
}: {
  traslado: TrasladoDetalle;
  onTerminar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const error =
    motivo.trim().length < 5 ? 'Explique por qué se cancela (mínimo 5 caracteres)' : undefined;
  const cancelar = useMutacion(
    () => api.post(`/traslados/${traslado.id}/cancelar`, { motivo: motivo.trim() }),
    { invalidar: INVALIDAR, exito: `Traslado #${traslado.numero} cancelado` },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!error) {
          cancelar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {cancelar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={cancelar.error} />
        </div>
      )}
      <Campo
        id="motivoCancelacion"
        etiqueta="Motivo"
        ayuda="Queda registrado en el traslado y en la bitácora"
        error={enviado ? error : undefined}
      >
        <Textarea
          id="motivoCancelacion"
          aria-invalid={enviado && !!error}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Campo>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Volver
        </Button>
        <Button type="submit" variant="destructivo" disabled={cancelar.isPending}>
          Cancelar traslado
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

function TablaProductos({ traslado }: { traslado: TrasladoDetalle }) {
  const despachado = traslado.detalles.some((d) => d.lote !== null);
  const recibido = traslado.estado === 'RECIBIDO';
  const totales = traslado.detalles.reduce(
    (t, d) => ({
      solicitada: t.solicitada + d.cantidadSolicitada,
      enviada: t.enviada + (d.cantidadEnviada ?? 0),
      recibida: t.recibida + (d.cantidadRecibida ?? 0),
    }),
    { solicitada: 0, enviada: 0, recibida: 0 },
  );

  const celdaProducto = (d: FilaTraslado) => (
    <TableCell>
      <span className="font-semibold">{d.producto.nombre}</span>
      <span className="block text-meta text-texto-secundario">
        {d.producto.sku} · {d.producto.presentacion}
      </span>
    </TableCell>
  );

  if (!despachado) {
    const pendiente = traslado.estado !== 'CANCELADO';
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            {pendiente && <TableHead numerico>Vigente en origen</TableHead>}
            <TableHead numerico>Solicitado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traslado.detalles.map((d) => {
            const falta = (d.disponibleOrigen ?? 0) < d.cantidadSolicitada;
            return (
              <TableRow key={d.id}>
                {celdaProducto(d)}
                {pendiente && (
                  <TableCell numerico className={cn(falta && 'font-semibold text-ladrillo')}>
                    {d.disponibleOrigen}
                    {falta && (
                      <span className="block text-meta font-normal">No alcanza para despachar</span>
                    )}
                  </TableCell>
                )}
                <TableCell numerico className="font-semibold">
                  {d.cantidadSolicitada}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Lote asignado (FEFO)</TableHead>
          <TableHead numerico>Despachado</TableHead>
          {recibido && <TableHead numerico>Recibido</TableHead>}
          {recibido && <TableHead numerico>Diferencia</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {traslado.detalles.map((d) => {
          const diferencia = (d.cantidadRecibida ?? 0) - (d.cantidadEnviada ?? 0);
          return (
            <TableRow key={d.id}>
              {celdaProducto(d)}
              <TableCell>
                {d.lote && (
                  <EtiquetaLote
                    numeroLote={d.lote.numeroLote}
                    fechaVencimiento={d.lote.fechaVencimiento}
                    {...vigenciaLocal(d.lote.fechaVencimiento)}
                  />
                )}
              </TableCell>
              <TableCell numerico>{d.cantidadEnviada}</TableCell>
              {recibido && <TableCell numerico>{d.cantidadRecibida}</TableCell>}
              {recibido && (
                <TableCell
                  numerico
                  className={cn(
                    diferencia < 0 ? 'font-semibold text-ladrillo' : 'text-texto-secundario',
                  )}
                >
                  {diferencia === 0 ? '—' : diferencia}
                </TableCell>
              )}
            </TableRow>
          );
        })}
        <TableRow className="bg-fondo hover:bg-fondo">
          <TableCell colSpan={2} className="text-right font-semibold">
            Total
          </TableCell>
          <TableCell numerico className="font-semibold">
            {totales.enviada}
          </TableCell>
          {recibido && (
            <TableCell numerico className="font-semibold">
              {totales.recibida}
            </TableCell>
          )}
          {recibido && (
            <TableCell numerico className="font-semibold">
              {totales.recibida - totales.enviada || '—'}
            </TableCell>
          )}
        </TableRow>
      </TableBody>
    </Table>
  );
}

function Historial({ traslado }: { traslado: TrasladoDetalle }) {
  return (
    <ol className="m-0 list-none p-4">
      {traslado.historial.map((h, i) => (
        <li key={h.estado} className="relative flex gap-3 pb-5 last:pb-0">
          {i < traslado.historial.length - 1 && (
            <span aria-hidden="true" className="absolute top-5 left-[7px] h-full w-px bg-borde" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative mt-1 size-[15px] shrink-0 rounded-full border-2',
              h.estado === 'CANCELADO'
                ? 'border-ladrillo bg-ladrillo-fondo'
                : 'border-verde-botica bg-salvia',
            )}
          />
          <div className="text-denso">
            <span className="block font-semibold">{ESTADOS_TRASLADO[h.estado]}</span>
            <span className="block text-texto-secundario tabular-nums">
              {formatearFechaHora(h.fecha)}
            </span>
            {h.usuario && <span className="block text-texto-secundario">{h.usuario.nombre}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

type Dialogo = 'aprobar' | 'despachar' | 'recibir' | 'cancelar' | null;

export function DetalleTraslado() {
  const { id } = useParams();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const consulta = useQuery({
    queryKey: ['traslados', 'detalle', id],
    queryFn: () => api.get<TrasladoDetalle>(`/traslados/${id}`),
  });
  const traslado = consulta.data;
  const cerrar = () => setDialogo(null);

  const aprobar = useMutacion(() => api.post(`/traslados/${id}/aprobar`), {
    invalidar: INVALIDAR,
    exito: `Traslado #${traslado?.numero} aprobado`,
    errorEnToast: true,
  });
  const despachar = useMutacion(() => api.post(`/traslados/${id}/despachar`), {
    invalidar: INVALIDAR,
    exito: `Traslado #${traslado?.numero} despachado`,
    errorEnToast: true,
  });

  const puede = (accion: Exclude<Dialogo, null>) => traslado?.acciones.includes(accion) ?? false;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={traslado ? `Traslado #${traslado.numero}` : 'Traslado'}
        descripcion={
          traslado && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {traslado.origen.nombre}
              <ArrowRight size={14} strokeWidth={1.75} aria-label="hacia" />
              {traslado.destino.nombre}
            </span>
          )
        }
        acciones={
          <>
            {puede('cancelar') && (
              <Button variant="terciario" onClick={() => setDialogo('cancelar')}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                Cancelar traslado
              </Button>
            )}
            {puede('aprobar') && (
              <Button variant="primario" onClick={() => setDialogo('aprobar')}>
                <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                Aprobar traslado
              </Button>
            )}
            {puede('despachar') && (
              <Button variant="primario" onClick={() => setDialogo('despachar')}>
                <Truck size={16} strokeWidth={1.75} aria-hidden="true" />
                Despachar traslado
              </Button>
            )}
            {puede('recibir') && (
              <Button variant="primario" onClick={() => setDialogo('recibir')}>
                <PackageCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                Recibir traslado
              </Button>
            )}
            <Button asChild>
              <Link to="/traslados">Volver a traslados</Link>
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
        traslado && (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="flex min-w-0 flex-col gap-6">
              <Panel>
                <dl className="m-0 grid gap-x-8 gap-y-3 p-4 text-denso sm:grid-cols-4">
                  <div>
                    <dt className="text-texto-secundario">Estado</dt>
                    <dd className="m-0 mt-0.5">
                      <BadgeTraslado estado={traslado.estado} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Origen</dt>
                    <dd className="m-0 font-semibold">{traslado.origen.nombre}</dd>
                    <dd className="m-0 text-meta text-texto-secundario">
                      {TIPOS_UBICACION[traslado.origen.tipo]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Destino</dt>
                    <dd className="m-0 font-semibold">{traslado.destino.nombre}</dd>
                    <dd className="m-0 text-meta text-texto-secundario">
                      {TIPOS_UBICACION[traslado.destino.tipo]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Motivo</dt>
                    <dd className="m-0 font-semibold">{MOTIVOS_TRASLADO[traslado.motivo]}</dd>
                    {traslado.pedido && (
                      <dd className="m-0 text-meta text-texto-secundario">
                        Pedido #{traslado.pedido.numero}
                      </dd>
                    )}
                  </div>
                  {traslado.observaciones && (
                    <div className="sm:col-span-4">
                      <dt className="text-texto-secundario">Observaciones</dt>
                      <dd className="m-0">{traslado.observaciones}</dd>
                    </div>
                  )}
                  {traslado.motivoCancelacion && (
                    <div className="sm:col-span-4">
                      <dt className="text-texto-secundario">Motivo de la cancelación</dt>
                      <dd className="m-0">{traslado.motivoCancelacion}</dd>
                    </div>
                  )}
                </dl>
              </Panel>
              <Panel>
                <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                  Productos
                </h2>
                <TablaProductos traslado={traslado} />
              </Panel>
            </div>
            <Panel className="self-start">
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Historial
              </h2>
              <Historial traslado={traslado} />
            </Panel>
          </div>
        )
      )}

      {traslado && (
        <>
          <ConfirmDialog
            abierto={dialogo === 'aprobar'}
            onAbiertoChange={(a) => !a && cerrar()}
            titulo={`Aprobar traslado #${traslado.numero}`}
            descripcion={`${traslado.origen.nombre} quedará autorizada para despachar ${traslado.detalles.length} ${traslado.detalles.length === 1 ? 'producto' : 'productos'} a ${traslado.destino.nombre}. Todavía no se mueve inventario.`}
            textoConfirmar="Aprobar traslado"
            pendiente={aprobar.isPending}
            onConfirmar={() => aprobar.mutate(undefined, { onSettled: cerrar })}
          />
          <ConfirmDialog
            abierto={dialogo === 'despachar'}
            onAbiertoChange={(a) => !a && cerrar()}
            titulo={`Despachar traslado #${traslado.numero}`}
            descripcion={`Se descontará la mercadería de ${traslado.origen.nombre}, asignando los lotes que vencen primero y sin usar lotes vencidos. El traslado quedará en tránsito hasta que ${traslado.destino.nombre} lo reciba.`}
            textoConfirmar="Despachar traslado"
            pendiente={despachar.isPending}
            onConfirmar={() => despachar.mutate(undefined, { onSettled: cerrar })}
          />
          <Dialog open={dialogo === 'recibir'} onOpenChange={(a) => !a && cerrar()}>
            {dialogo === 'recibir' && (
              <DialogContent
                titulo={`Recibir traslado #${traslado.numero}`}
                descripcion={`Ingresa a ${traslado.destino.nombre} con los mismos lotes despachados.`}
                className="max-w-2xl"
              >
                <FormularioRecepcion traslado={traslado} onTerminar={cerrar} />
              </DialogContent>
            )}
          </Dialog>
          <Dialog open={dialogo === 'cancelar'} onOpenChange={(a) => !a && cerrar()}>
            {dialogo === 'cancelar' && (
              <DialogContent
                titulo={`Cancelar traslado #${traslado.numero}`}
                descripcion="El traslado no se ha despachado, así que no se mueve inventario."
              >
                <FormularioCancelacion traslado={traslado} onTerminar={cerrar} />
              </DialogContent>
            )}
          </Dialog>
        </>
      )}
    </Pagina>
  );
}
