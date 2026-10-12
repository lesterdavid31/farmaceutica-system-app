import { useQuery } from '@tanstack/react-query';
import { Info, Plus, Search, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BadgeEstado } from '@/components/BadgeEstado';
import { MapaPunto } from '@/components/MapaPunto';
import { Campo, Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { SelectorProducto, type ProductoElegido } from '@/components/SelectorProducto';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query, type Pagina as PaginaApi } from '@/lib/api';
import { useDebounce, useMutacion } from '@/lib/consultas';
import {
  METODOS_PEDIDO,
  TIPOS_UBICACION,
  type Cliente,
  type ClienteDetalle,
  type MetodoPedido,
  type OpcionDisponibilidad,
  type PedidoDetalle,
  type RespuestaDisponibilidad,
} from '@/lib/dominio';
import { formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { DialogoCliente, DialogoDireccion } from './dialogos-cliente';

interface Linea {
  clave: number;
  producto: ProductoElegido | null;
  cantidad: string;
}

const minutos = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();

/** Fecha y hora local en el formato de <input type="datetime-local">. */
function aLocal(fecha: Date) {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** Ahora + minutos, redondeado hacia arriba a los siguientes 5 minutos. */
function compromisoSugerido(min: number) {
  const cinco = 5 * 60_000;
  return new Date(Math.ceil((Date.now() + min * 60_000) / cinco) * cinco);
}

function PasoTitulo({ numero, titulo }: { numero: number; titulo: string }) {
  return (
    <h2 className="m-0 flex items-center gap-2 border-b border-borde px-4 py-3 text-seccion font-semibold">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-salvia text-meta text-verde-botica">
        {numero}
      </span>
      {titulo}
    </h2>
  );
}

function BuscarCliente({ onElegir }: { onElegir: (c: Cliente) => void }) {
  const [q, setQ] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const busqueda = useDebounce(q.trim(), 250);
  const resultados = useQuery({
    queryKey: ['clientes', 'buscar', busqueda],
    queryFn: () =>
      api.get<PaginaApi<Cliente>>(`/clientes${query({ q: busqueda, activo: true, limit: 6 })}`),
    enabled: busqueda.length >= 3,
  });
  const digitos = q.replace(/[\s-]/g, '');
  return (
    <div className="p-4">
      <label className="relative block">
        <span className="sr-only">Buscar cliente</span>
        <Search
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
        />
        <Input
          type="search"
          autoFocus
          inputMode="tel"
          placeholder="Teléfono del cliente (o nombre)"
          className="h-12 pl-10 text-cuerpo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {busqueda.length >= 3 && (
        <div className="mt-3">
          {resultados.isPending ? (
            <Cargando texto="Buscando..." />
          ) : resultados.data && resultados.data.data.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {resultados.data.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(c)}
                    className="flex w-full items-center justify-between rounded-control border border-borde px-3 py-2 text-left hover:border-verde-botica hover:bg-salvia"
                  >
                    <span>
                      <span className="block text-denso font-semibold">{c.nombre}</span>
                      <span className="text-meta text-texto-secundario">
                        {c.direcciones.length}{' '}
                        {c.direcciones.length === 1 ? 'dirección' : 'direcciones'}
                      </span>
                    </span>
                    <span className="text-denso tabular-nums">{c.telefono}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-denso text-texto-secundario">
              No hay clientes con «{busqueda}».{' '}
              <Button size="sm" variant="terciario" onClick={() => setRegistrando(true)}>
                Registrar cliente
              </Button>
            </p>
          )}
        </div>
      )}
      <DialogoCliente
        abierto={registrando}
        telefonoInicial={/^\d+$/.test(digitos) ? digitos : undefined}
        onCerrar={() => setRegistrando(false)}
        onListo={onElegir}
      />
    </div>
  );
}

function TablaOpciones({
  r,
  elegida,
  onElegir,
}: {
  r: RespuestaDisponibilidad;
  elegida: string | null;
  onElegir: (o: OpcionDisponibilidad) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <span className="sr-only">Elegir</span>
          </TableHead>
          <TableHead>Sucursal</TableHead>
          <TableHead numerico>Tiempo estimado</TableHead>
          <TableHead numerico>Distancia</TableHead>
          <TableHead>Formas de pago</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {r.opciones.map((o) => {
          const mejor = o.ubicacion.id === r.mejorId;
          return (
            <TableRow
              key={o.ubicacion.id}
              className={cn('cursor-pointer', mejor && 'bg-salvia hover:bg-salvia')}
              onClick={() => onElegir(o)}
            >
              <TableCell className="w-10">
                <input
                  type="radio"
                  name="sucursal"
                  aria-label={`Despachar desde ${o.ubicacion.nombre}`}
                  className="accent-verde-botica"
                  checked={elegida === o.ubicacion.id}
                  onChange={() => onElegir(o)}
                />
              </TableCell>
              <TableCell>
                <span className="font-semibold">{o.ubicacion.nombre}</span>
                {mejor && (
                  <span className="ml-2">
                    <BadgeEstado tono="correcto">Mejor opción</BadgeEstado>
                  </span>
                )}
                <span className="block text-meta text-texto-secundario">
                  {TIPOS_UBICACION[o.ubicacion.tipo]}
                </span>
              </TableCell>
              <TableCell numerico>
                <span className="font-semibold">{minutos(o.tiempoEstimadoMin)}</span>
                <span className="block text-meta text-texto-secundario">
                  ruta {minutos(o.rutaMin)} + preparación {r.preparacionMin} min
                </span>
              </TableCell>
              <TableCell numerico className="whitespace-nowrap">
                {o.distanciaKm.toFixed(1)} km
              </TableCell>
              <TableCell>
                {o.formasPago.map((f) => METODOS_PEDIDO[f]).join(' · ')}
                {!o.cajaAbierta && (
                  <span className="block text-meta text-ambar">Sin caja abierta ahora</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function NuevoPedido() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const [clienteId, setClienteId] = useState(parametros.get('clienteId') ?? '');
  const [direccionId, setDireccionId] = useState('');
  const [agregandoDireccion, setAgregandoDireccion] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([{ clave: 1, producto: null, cantidad: '1' }]);
  const [resultado, setResultado] = useState<{ clave: string; r: RespuestaDisponibilidad } | null>(
    null,
  );
  const [elegida, setElegida] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPedido>('CONTRA_ENTREGA');
  const [compromiso, setCompromiso] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const cliente = useQuery({
    queryKey: ['clientes', 'detalle', clienteId],
    queryFn: () => api.get<ClienteDetalle>(`/clientes/${clienteId}`),
    enabled: clienteId !== '',
  });
  const direcciones = cliente.data?.direcciones.filter((d) => d.activa) ?? [];
  const direccionActual =
    direcciones.find((d) => d.id === direccionId) ??
    direcciones.find((d) => d.principal) ??
    direcciones[0];

  const items = lineas
    .filter((l) => l.producto && /^\d+$/.test(l.cantidad) && Number(l.cantidad) > 0)
    .map((l) => ({ productoId: l.producto!.id, cantidad: Number(l.cantidad) }));
  const repetido = new Set(items.map((i) => i.productoId)).size !== items.length;
  const claveConsulta = JSON.stringify({ d: direccionActual?.id, items });
  const vigente = resultado?.clave === claveConsulta ? resultado.r : null;

  const consultar = useMutacion(
    () =>
      api.post<RespuestaDisponibilidad>('/pedidos/disponibilidad', {
        items,
        direccionId: direccionActual!.id,
      }),
    { invalidar: [], exito: 'Disponibilidad consultada' },
  );
  const crear = useMutacion(
    (ubicacionDespachoId: string) =>
      api.post<PedidoDetalle>('/pedidos', {
        clienteId,
        direccionId: direccionActual!.id,
        ubicacionDespachoId,
        items,
        metodoPago,
        fechaCompromiso: compromiso ? new Date(compromiso).toISOString() : undefined,
        observaciones: observaciones.trim() || undefined,
      }),
    {
      invalidar: [['pedidos'], ['clientes'], ['traslados']],
      exito: (p) => `Pedido #${p.numero} creado`,
    },
  );

  const elegir = (o: OpcionDisponibilidad) => {
    setElegida(o.ubicacion.id);
    setCompromiso(aLocal(compromisoSugerido(o.tiempoEstimadoMin)));
  };
  const opcionElegida =
    vigente?.opciones.find((o) => o.ubicacion.id === elegida) ??
    (vigente?.sugerencia?.ubicacion.id === elegida ? vigente.sugerencia : undefined);
  const puedeCrear =
    !!opcionElegida &&
    !(vigente?.sugerencia?.sinCubrir.length && opcionElegida === vigente.sugerencia);

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Nuevo pedido"
        descripcion="Busque al cliente, elija la dirección, agregue productos y consulte qué sucursal entrega más rápido."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PasoTitulo numero={1} titulo="Cliente" />
            {!clienteId ? (
              <BuscarCliente
                onElegir={(c) => {
                  setClienteId(c.id);
                  setDireccionId('');
                  setResultado(null);
                }}
              />
            ) : cliente.isPending ? (
              <Cargando />
            ) : cliente.error ? (
              <PanelError error={cliente.error} />
            ) : (
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="text-denso">
                  <span className="block font-semibold">{cliente.data.nombre}</span>
                  <span className="text-texto-secundario tabular-nums">
                    Tel. {cliente.data.telefono} · NIT {cliente.data.nit ?? 'CF'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="terciario"
                  onClick={() => {
                    setClienteId('');
                    setResultado(null);
                  }}
                >
                  Cambiar cliente
                </Button>
              </div>
            )}
          </Panel>

          {cliente.data && (
            <Panel>
              <PasoTitulo numero={2} titulo="Dirección de entrega" />
              <div className="flex flex-col gap-2 p-4">
                {direcciones.length === 0 && (
                  <p className="m-0 text-denso text-texto-secundario">
                    El cliente no tiene direcciones activas.
                  </p>
                )}
                {direcciones.map((d) => (
                  <label
                    key={d.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2 text-denso',
                      direccionActual?.id === d.id
                        ? 'border-verde-botica bg-salvia'
                        : 'border-borde hover:bg-fondo',
                    )}
                  >
                    <input
                      type="radio"
                      name="direccion"
                      className="mt-1 accent-verde-botica"
                      checked={direccionActual?.id === d.id}
                      onChange={() => setDireccionId(d.id)}
                    />
                    <span>
                      <span className="block font-semibold">{d.alias ?? 'Dirección'}</span>
                      {d.direccion}
                      {d.referencia && (
                        <span className="block text-texto-secundario">{d.referencia}</span>
                      )}
                    </span>
                  </label>
                ))}
                <div>
                  <Button size="sm" onClick={() => setAgregandoDireccion(true)}>
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Agregar dirección
                  </Button>
                </div>
              </div>
              <DialogoDireccion
                abierto={agregandoDireccion}
                clienteId={clienteId}
                onCerrar={() => setAgregandoDireccion(false)}
                onListo={(c) => {
                  const nueva = c.direcciones.find(
                    (d) => d.activa && !direcciones.some((x) => x.id === d.id),
                  );
                  if (nueva) {
                    setDireccionId(nueva.id);
                  }
                }}
              />
            </Panel>
          )}

          {direccionActual && (
            <Panel>
              <PasoTitulo numero={3} titulo="Productos" />
              <ul className="m-0 flex list-none flex-col gap-3 p-4">
                {lineas.map((l, i) => (
                  <li key={l.clave} className="flex items-start gap-2">
                    <SelectorProducto
                      className="flex-1"
                      valor={l.producto}
                      onCambio={(p) =>
                        setLineas((ls) =>
                          ls.map((x) => (x.clave === l.clave ? { ...x, producto: p } : x)),
                        )
                      }
                    />
                    <Input
                      inputMode="numeric"
                      aria-label={`Cantidad, fila ${i + 1}`}
                      className="w-20 text-right tabular-nums"
                      value={l.cantidad}
                      onChange={(e) =>
                        setLineas((ls) =>
                          ls.map((x) =>
                            x.clave === l.clave ? { ...x, cantidad: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icono"
                      variant="terciario"
                      aria-label={`Quitar fila ${i + 1}`}
                      disabled={lineas.length === 1}
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3">
                <Button
                  size="sm"
                  onClick={() =>
                    setLineas((ls) => [
                      ...ls,
                      {
                        clave: Math.max(...ls.map((x) => x.clave)) + 1,
                        producto: null,
                        cantidad: '1',
                      },
                    ])
                  }
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                  Agregar producto
                </Button>
                <Button
                  variant="primario"
                  disabled={items.length === 0 || repetido || consultar.isPending}
                  onClick={() =>
                    consultar.mutate(undefined, {
                      onSuccess: (r) => {
                        setResultado({ clave: claveConsulta, r });
                        const inicial =
                          r.opciones[0] ?? (r.sugerencia?.sinCubrir.length ? null : r.sugerencia);
                        if (inicial) {
                          elegir(inicial);
                        } else {
                          setElegida(null);
                        }
                      },
                    })
                  }
                >
                  {consultar.isPending ? 'Consultando...' : 'Consultar disponibilidad'}
                </Button>
              </div>
              {repetido && (
                <p className="m-0 px-4 pb-3 text-meta text-ladrillo">
                  Hay un producto repetido; sume las cantidades en una sola fila.
                </p>
              )}
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {consultar.error && (
            <Panel>
              <PanelError error={consultar.error} />
            </Panel>
          )}
          {resultado && !vigente && (
            <Panel>
              <p className="m-0 flex items-center gap-2 px-4 py-3 text-denso text-texto-secundario">
                <Info size={16} strokeWidth={1.75} aria-hidden="true" />
                Cambió la dirección o los productos: consulte la disponibilidad de nuevo.
              </p>
            </Panel>
          )}
          {!resultado && (
            <Panel>
              <p className="m-0 px-4 py-8 text-center text-denso text-texto-secundario">
                Los resultados de «Consultar disponibilidad» aparecen aquí: las sucursales que
                tienen todo el pedido, con el tiempo estimado de entrega.
              </p>
            </Panel>
          )}
          {vigente && (
            <>
              <Panel>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borde px-4 py-3">
                  <h2 className="m-0 text-seccion font-semibold">Disponibilidad</h2>
                  <span className="text-denso">
                    Total del pedido{' '}
                    <span className="font-semibold tabular-nums">
                      {formatearMoneda(vigente.total)}
                    </span>
                  </span>
                </div>
                {vigente.fuente !== 'google' && (
                  <p className="m-0 flex items-center gap-2 border-b border-borde bg-fondo px-4 py-2 text-meta text-texto-secundario">
                    <Info size={14} strokeWidth={1.75} aria-hidden="true" />
                    Tiempos {vigente.fuente === 'mixta' ? 'en parte ' : ''}estimados por distancia:
                    Google Maps no estuvo disponible.
                  </p>
                )}
                {vigente.opciones.length > 0 ? (
                  <TablaOpciones r={vigente} elegida={elegida} onElegir={elegir} />
                ) : vigente.sugerencia ? (
                  <div className="p-4 text-denso">
                    <p className="m-0 mb-3">
                      Ninguna sucursal tiene todo el pedido.{' '}
                      {vigente.sugerencia.sinCubrir.length === 0 &&
                        'Se propone la sucursal más cercana con un traslado:'}
                    </p>
                    {vigente.sugerencia.sinCubrir.length > 0 ? (
                      <div className="rounded-control bg-ladrillo-fondo px-3 py-2 text-ladrillo">
                        No hay existencia vigente suficiente en ninguna ubicación de la cadena para:{' '}
                        {vigente.sugerencia.sinCubrir
                          .map((s) => `${s.nombre} (faltan ${s.cantidad})`)
                          .join(', ')}
                        .
                      </div>
                    ) : (
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-control border px-3 py-3',
                          elegida === vigente.sugerencia.ubicacion.id
                            ? 'border-verde-botica bg-salvia'
                            : 'border-borde',
                        )}
                      >
                        <input
                          type="radio"
                          name="sucursal"
                          className="mt-1 accent-verde-botica"
                          checked={elegida === vigente.sugerencia.ubicacion.id}
                          onChange={() => elegir(vigente.sugerencia!)}
                        />
                        <span className="flex-1">
                          <span className="block font-semibold">
                            {vigente.sugerencia.ubicacion.nombre}{' '}
                            <span className="font-normal text-texto-secundario">
                              · {minutos(vigente.sugerencia.tiempoEstimadoMin)} ·{' '}
                              {vigente.sugerencia.distanciaKm.toFixed(1)} km
                            </span>
                          </span>
                          {vigente.sugerencia.traslados.map((t) => (
                            <span key={t.origen.id} className="mt-1 flex items-start gap-2">
                              <Truck
                                size={16}
                                strokeWidth={1.75}
                                aria-hidden="true"
                                className="mt-0.5 shrink-0 text-acero"
                              />
                              <span>
                                Traslado desde <strong>{t.origen.nombre}</strong> (
                                {minutos(t.tiempoMin)}):{' '}
                                {t.items.map((x) => `${x.cantidad} × ${x.nombre}`).join(', ')}
                              </span>
                            </span>
                          ))}
                          <span className="mt-1 block text-meta text-texto-secundario">
                            Tiempo = traslado{' '}
                            {minutos(
                              Math.max(...vigente.sugerencia.traslados.map((t) => t.tiempoMin)),
                            )}{' '}
                            + preparación en origen y en sucursal ({vigente.preparacionMin} min c/u)
                            + ruta {minutos(vigente.sugerencia.rutaMin)}. El traslado se solicita al
                            crear el pedido.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                ) : (
                  <p className="m-0 px-4 py-6 text-denso text-texto-secundario">
                    No hay sucursales activas para despachar.
                  </p>
                )}
                <div className="border-t border-borde p-4">
                  <MapaPunto
                    valor={vigente.destino}
                    marcadores={[
                      ...vigente.opciones,
                      ...(vigente.sugerencia ? [vigente.sugerencia] : []),
                    ].map((o) => ({
                      id: o.ubicacion.id,
                      etiqueta: `${o.ubicacion.nombre} · ${minutos(o.tiempoEstimadoMin)}`,
                      latitud: o.ubicacion.latitud,
                      longitud: o.ubicacion.longitud,
                      destacado: o.ubicacion.id === elegida,
                    }))}
                    className="h-56"
                  />
                </div>
              </Panel>

              {opcionElegida && puedeCrear && (
                <Panel>
                  <PasoTitulo
                    numero={4}
                    titulo={`Crear pedido en ${opcionElegida.ubicacion.nombre}`}
                  />
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    <fieldset className="m-0 border-0 p-0 sm:col-span-2">
                      <legend className="mb-1.5 text-denso font-semibold">Forma de pago</legend>
                      <div className="flex flex-wrap gap-4 text-denso">
                        {opcionElegida.formasPago.map((f) => (
                          <label key={f} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="metodoPago"
                              className="accent-verde-botica"
                              checked={metodoPago === f}
                              onChange={() => setMetodoPago(f)}
                            />
                            {METODOS_PEDIDO[f]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Campo
                      id="compromiso"
                      etiqueta="Fecha de compromiso"
                      ayuda={`Tiempo estimado: ${minutos(opcionElegida.tiempoEstimadoMin)}`}
                    >
                      <Input
                        id="compromiso"
                        type="datetime-local"
                        value={compromiso}
                        onChange={(e) => setCompromiso(e.target.value)}
                      />
                    </Campo>
                    <Campo id="observacionesPedido" etiqueta="Observaciones">
                      <Textarea
                        id="observacionesPedido"
                        className="min-h-10"
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                      />
                    </Campo>
                  </div>
                  {crear.error && (
                    <div className="px-4 pb-4">
                      <PanelError error={crear.error} />
                    </div>
                  )}
                  <div className="flex justify-end border-t border-borde px-4 py-3">
                    <Button
                      variant="primario"
                      size="lg"
                      disabled={crear.isPending}
                      onClick={() =>
                        crear.mutate(opcionElegida.ubicacion.id, {
                          onSuccess: (p) => navegar(`/pedidos/${p.id}`),
                        })
                      }
                    >
                      {crear.isPending ? 'Creando pedido...' : 'Crear pedido'}
                    </Button>
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </Pagina>
  );
}
