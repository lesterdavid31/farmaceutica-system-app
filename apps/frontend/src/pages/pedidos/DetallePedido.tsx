import { useQuery } from '@tanstack/react-query';
import { Bike, Check, PackageCheck, PackageOpen, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BadgeEstado } from '@/components/BadgeEstado';
import { MapaPunto } from '@/components/MapaPunto';
import { Campo, Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import {
  ESTADOS_PEDIDO,
  ESTADOS_TRASLADO,
  METODOS_PEDIDO,
  type PedidoDetalle,
  type Repartidor,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { BadgeAtraso, BadgePedido } from './Pedidos';

const INVALIDAR = [['pedidos'], ['inventario'], ['caja'], ['ventas'], ['traslados']];

function FormularioAsignar({
  pedido,
  onTerminar,
}: {
  pedido: PedidoDetalle;
  onTerminar: () => void;
}) {
  const [repartidorId, setRepartidorId] = useState(pedido.entrega?.repartidor.id ?? '');
  const repartidores = useQuery({
    queryKey: ['pedidos', 'repartidores', pedido.ubicacionDespachoId],
    queryFn: () =>
      api.get<Repartidor[]>(
        `/pedidos/repartidores${query({ ubicacionId: pedido.ubicacionDespachoId })}`,
      ),
  });
  const asignar = useMutacion(() => api.post(`/pedidos/${pedido.id}/asignar`, { repartidorId }), {
    invalidar: INVALIDAR,
    exito: 'Repartidor asignado',
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (repartidorId) {
          asignar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {asignar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={asignar.error} />
        </div>
      )}
      <Campo
        id="repartidor"
        etiqueta="Repartidor"
        ayuda="Empleados con puesto de repartidor de la sucursal"
      >
        <Select
          id="repartidor"
          value={repartidorId}
          onChange={(e) => setRepartidorId(e.target.value)}
        >
          <option value="">
            {repartidores.isPending ? 'Cargando...' : 'Seleccione el repartidor'}
          </option>
          {repartidores.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombres} {r.apellidos}
            </option>
          ))}
        </Select>
      </Campo>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={!repartidorId || asignar.isPending}>
          Asignar repartidor
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioEntregar({
  pedido,
  onTerminar,
}: {
  pedido: PedidoDetalle;
  onTerminar: () => void;
}) {
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const entregar = useMutacion(
    () =>
      api.post(`/pedidos/${pedido.id}/entregar`, {
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      }),
    { invalidar: INVALIDAR, exito: `Pedido #${pedido.numero} entregado` },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        entregar.mutate(undefined, { onSuccess: onTerminar });
      }}
    >
      {entregar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={entregar.error} />
        </div>
      )}
      <p className="m-0 mb-4 flex items-baseline justify-between">
        <span className="text-denso text-texto-secundario">
          {METODOS_PEDIDO[pedido.metodoPago]}
        </span>
        <span className="text-pagina font-semibold tabular-nums">
          {formatearMoneda(pedido.total)}
        </span>
      </p>
      {!pedido.cajaAbierta && (
        <p className="m-0 mb-4 rounded-control bg-ambar-fondo px-3 py-2 text-denso text-ambar">
          No hay caja abierta en la sucursal: abra un turno para poder registrar el cobro.
        </p>
      )}
      <p className="m-0 mb-4 text-denso text-texto-secundario">
        El cobro entra a su caja si usted es cajero; si confirma el gerente, al turno abierto más
        antiguo de la sucursal.
        {pedido.metodoPago === 'CONTRA_ENTREGA' &&
          ' Contra entrega es efectivo: el repartidor lo entrega en la caja.'}
      </p>
      <div className="flex flex-col gap-4">
        {pedido.metodoPago === 'TARJETA' && (
          <Campo id="referencia" etiqueta="Autorización del datáfono">
            <Input
              id="referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </Campo>
        )}
        <Campo id="notasEntrega" etiqueta="Notas de la entrega">
          <Textarea
            id="notasEntrega"
            placeholder="Por ejemplo: recibió el guardia"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={entregar.isPending}>
          Confirmar entrega
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioCancelar({
  pedido,
  onTerminar,
}: {
  pedido: PedidoDetalle;
  onTerminar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const error =
    motivo.trim().length < 5
      ? 'Explique el motivo de la cancelación (mínimo 5 caracteres)'
      : undefined;
  const cancelar = useMutacion(
    () => api.post(`/pedidos/${pedido.id}/cancelar`, { motivo: motivo.trim() }),
    { invalidar: INVALIDAR, exito: `Pedido #${pedido.numero} cancelado` },
  );
  const pendientes = pedido.traslados.filter(
    (t) => t.estado === 'SOLICITADO' || t.estado === 'APROBADO',
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
      <ul className="m-0 mb-4 list-disc pl-5 text-denso">
        {pedido.venta ? (
          <li>
            La venta #{pedido.venta.numero} se anula y el producto vuelve a la existencia de{' '}
            {pedido.ubicacionDespacho.nombre}.
          </li>
        ) : (
          <li>Todavía no se ha descontado inventario.</li>
        )}
        {pendientes.length > 0 && (
          <li>
            Se cancela{pendientes.length > 1 ? 'n' : ''} el traslado
            {pendientes.length > 1 ? 's' : ''} {pendientes.map((t) => `#${t.numero}`).join(', ')}.
          </li>
        )}
        <li>No se puede deshacer.</li>
      </ul>
      <Campo id="motivoCancelacion" etiqueta="Motivo" error={enviado ? error : undefined}>
        <Textarea
          id="motivoCancelacion"
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
        <Button type="submit" variant="destructivo" disabled={cancelar.isPending}>
          Cancelar pedido
        </Button>
      </DialogFooter>
    </form>
  );
}

type Dialogo = 'preparar' | 'asignar' | 'salir' | 'entregar' | 'cancelar' | null;

export function DetallePedido() {
  const { id } = useParams();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const consulta = useQuery({
    queryKey: ['pedidos', 'detalle', id],
    queryFn: () => api.get<PedidoDetalle>(`/pedidos/${id}`),
  });
  const pedido = consulta.data;
  const cerrar = () => setDialogo(null);
  const puede = (a: Exclude<Dialogo, null>) => pedido?.acciones.includes(a) ?? false;

  const preparar = useMutacion(() => api.post(`/pedidos/${id}/preparar`), {
    invalidar: INVALIDAR,
    exito: 'Pedido en preparación',
    errorEnToast: true,
  });
  const salir = useMutacion(() => api.post(`/pedidos/${id}/salir`), {
    invalidar: INVALIDAR,
    exito: 'Pedido en camino',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={pedido ? `Pedido #${pedido.numero}` : 'Pedido'}
        descripcion={
          pedido &&
          `${pedido.cliente.nombre} · despacha ${pedido.ubicacionDespacho.nombre} · creado ${formatearFechaHora(pedido.createdAt)}`
        }
        acciones={
          <>
            {puede('cancelar') && (
              <Button variant="terciario" onClick={() => setDialogo('cancelar')}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
                Cancelar pedido
              </Button>
            )}
            {puede('preparar') && (
              <Button variant="primario" onClick={() => setDialogo('preparar')}>
                <PackageOpen size={16} strokeWidth={1.75} aria-hidden="true" />
                Preparar pedido
              </Button>
            )}
            {puede('asignar') && (
              <Button
                variant={pedido?.estado === 'EN_PREPARACION' ? 'primario' : 'secundario'}
                onClick={() => setDialogo('asignar')}
              >
                <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                {pedido?.entrega ? 'Cambiar repartidor' : 'Asignar repartidor'}
              </Button>
            )}
            {puede('salir') && (
              <Button variant="primario" onClick={() => setDialogo('salir')}>
                <Bike size={16} strokeWidth={1.75} aria-hidden="true" />
                Salir a entregar
              </Button>
            )}
            {puede('entregar') && (
              <Button variant="primario" onClick={() => setDialogo('entregar')}>
                <PackageCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                Confirmar entrega
              </Button>
            )}
            <Button asChild>
              <Link to="/pedidos">Volver a pedidos</Link>
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
        pedido && (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="flex min-w-0 flex-col gap-6">
              <Panel>
                <dl className="m-0 grid gap-x-8 gap-y-3 p-4 text-denso sm:grid-cols-4">
                  <div>
                    <dt className="text-texto-secundario">Estado</dt>
                    <dd className="m-0 mt-0.5 flex flex-col items-start gap-1">
                      <BadgePedido estado={pedido.estado} />
                      {pedido.atrasado && <BadgeAtraso minutos={pedido.minutosAtraso} />}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Compromiso</dt>
                    <dd
                      className={cn(
                        'm-0 font-semibold tabular-nums',
                        pedido.atrasado && 'text-ladrillo',
                      )}
                    >
                      {formatearFechaHora(pedido.fechaCompromiso)}
                    </dd>
                    <dd className="m-0 text-meta text-texto-secundario">
                      Estimado {pedido.tiempoEstimadoMin} min ·{' '}
                      {Number(pedido.distanciaKm).toFixed(1)} km
                      {pedido.fuenteEstimacion === 'estimado' && ' (aprox.)'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Pago</dt>
                    <dd className="m-0 font-semibold">{METODOS_PEDIDO[pedido.metodoPago]}</dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Total</dt>
                    <dd className="m-0 text-seccion font-semibold tabular-nums">
                      {formatearMoneda(pedido.total)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-texto-secundario">Cliente</dt>
                    <dd className="m-0 font-semibold">{pedido.cliente.nombre}</dd>
                    <dd className="m-0 tabular-nums">
                      Tel. {pedido.cliente.telefono} · NIT {pedido.cliente.nit ?? 'CF'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-texto-secundario">Entregar en</dt>
                    <dd className="m-0">{pedido.direccion.direccion}</dd>
                    {pedido.direccion.referencia && (
                      <dd className="m-0 text-texto-secundario">{pedido.direccion.referencia}</dd>
                    )}
                  </div>
                  {pedido.entrega && (
                    <div className="sm:col-span-2">
                      <dt className="text-texto-secundario">Repartidor</dt>
                      <dd className="m-0 font-semibold">
                        {pedido.entrega.repartidor.nombres} {pedido.entrega.repartidor.apellidos}
                      </dd>
                      <dd className="m-0 text-meta text-texto-secundario tabular-nums">
                        {pedido.entrega.horaSalida &&
                          `Salió ${formatearFechaHora(pedido.entrega.horaSalida)}`}
                        {pedido.entrega.horaEntrega &&
                          ` · entregó ${formatearFechaHora(pedido.entrega.horaEntrega)}`}
                      </dd>
                      {pedido.entrega.notas && <dd className="m-0">{pedido.entrega.notas}</dd>}
                    </div>
                  )}
                  {pedido.venta && (
                    <div>
                      <dt className="text-texto-secundario">Venta</dt>
                      <dd className="m-0">
                        <Link
                          to={`/ventas/${pedido.venta.id}`}
                          className="font-semibold text-verde-botica"
                        >
                          #{pedido.venta.numero}
                        </Link>
                        {pedido.venta.estado === 'ANULADA' && (
                          <span className="ml-2">
                            <BadgeEstado tono="peligro">Anulada</BadgeEstado>
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  {pedido.traslados.length > 0 && (
                    <div>
                      <dt className="text-texto-secundario">Traslados</dt>
                      {pedido.traslados.map((t) => (
                        <dd key={t.id} className="m-0">
                          <Link
                            to={`/traslados/${t.id}`}
                            className="font-semibold text-verde-botica"
                          >
                            #{t.numero}
                          </Link>{' '}
                          desde {t.origen.nombre} · {ESTADOS_TRASLADO[t.estado]}
                        </dd>
                      ))}
                    </div>
                  )}
                  {pedido.observaciones && (
                    <div className="sm:col-span-4">
                      <dt className="text-texto-secundario">Observaciones</dt>
                      <dd className="m-0">{pedido.observaciones}</dd>
                    </div>
                  )}
                  {pedido.motivoCancelacion && (
                    <div className="sm:col-span-4">
                      <dt className="text-texto-secundario">Motivo de la cancelación</dt>
                      <dd className="m-0">{pedido.motivoCancelacion}</dd>
                    </div>
                  )}
                </dl>
              </Panel>
              <Panel>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead numerico>Cantidad</TableHead>
                      <TableHead numerico>Precio</TableHead>
                      <TableHead numerico>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedido.detalles.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <span className="font-semibold">{d.producto.nombre}</span>
                          <span className="block text-meta text-texto-secundario">
                            {d.producto.sku} · {d.producto.presentacion}
                          </span>
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
                  </TableBody>
                </Table>
              </Panel>
              <Panel>
                <div className="p-4">
                  <MapaPunto
                    valor={{
                      latitud: Number(pedido.direccion.latitud),
                      longitud: Number(pedido.direccion.longitud),
                    }}
                    className="h-56"
                  />
                </div>
              </Panel>
            </div>
            <Panel className="self-start">
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Historial
              </h2>
              <ol className="m-0 list-none p-4">
                {pedido.historial.map((h, i) => (
                  <li key={h.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < pedido.historial.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-5 left-[7px] h-full w-px bg-borde"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative mt-1 size-[15px] shrink-0 rounded-full border-2',
                        h.estadoNuevo === 'CANCELADO'
                          ? 'border-ladrillo bg-ladrillo-fondo'
                          : 'border-verde-botica bg-salvia',
                      )}
                    />
                    <div className="text-denso">
                      <span className="block font-semibold">
                        {h.estadoAnterior === h.estadoNuevo
                          ? 'Nota'
                          : ESTADOS_PEDIDO[h.estadoNuevo]}
                      </span>
                      {h.nota && <span className="block">{h.nota}</span>}
                      <span className="block text-texto-secundario tabular-nums">
                        {formatearFechaHora(h.createdAt)}
                      </span>
                      <span className="block text-texto-secundario">{h.usuario.nombre}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        )
      )}

      {pedido && (
        <>
          <ConfirmDialog
            abierto={dialogo === 'preparar'}
            onAbiertoChange={(a) => !a && cerrar()}
            titulo={`Preparar pedido #${pedido.numero}`}
            descripcion={`Se descontará el inventario de ${pedido.ubicacionDespacho.nombre} (los lotes que vencen primero) y se generará la venta del pedido. El cobro se registra al entregar.`}
            textoConfirmar="Preparar pedido"
            pendiente={preparar.isPending}
            onConfirmar={() => preparar.mutate(undefined, { onSettled: cerrar })}
          />
          <ConfirmDialog
            abierto={dialogo === 'salir'}
            onAbiertoChange={(a) => !a && cerrar()}
            titulo="Salir a entregar"
            descripcion={`${pedido.entrega?.repartidor.nombres ?? 'El repartidor'} sale con el pedido #${pedido.numero} hacia ${pedido.direccion.direccion}.`}
            textoConfirmar="Salir a entregar"
            pendiente={salir.isPending}
            onConfirmar={() => salir.mutate(undefined, { onSettled: cerrar })}
          />
          <Dialog open={dialogo === 'asignar'} onOpenChange={(a) => !a && cerrar()}>
            {dialogo === 'asignar' && (
              <DialogContent titulo={`Asignar repartidor al pedido #${pedido.numero}`}>
                <FormularioAsignar pedido={pedido} onTerminar={cerrar} />
              </DialogContent>
            )}
          </Dialog>
          <Dialog open={dialogo === 'entregar'} onOpenChange={(a) => !a && cerrar()}>
            {dialogo === 'entregar' && (
              <DialogContent titulo={`Confirmar entrega del pedido #${pedido.numero}`}>
                <FormularioEntregar pedido={pedido} onTerminar={cerrar} />
              </DialogContent>
            )}
          </Dialog>
          <Dialog open={dialogo === 'cancelar'} onOpenChange={(a) => !a && cerrar()}>
            {dialogo === 'cancelar' && (
              <DialogContent titulo={`Cancelar pedido #${pedido.numero}`}>
                <FormularioCancelar pedido={pedido} onTerminar={cerrar} />
              </DialogContent>
            )}
          </Dialog>
        </>
      )}
    </Pagina>
  );
}
