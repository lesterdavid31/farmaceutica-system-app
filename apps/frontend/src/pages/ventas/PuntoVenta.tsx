import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { BadgeEstado } from '@/components/BadgeEstado';
import { Campo, Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, query } from '@/lib/api';
import { useDebounce, useMutacion } from '@/lib/consultas';
import type { PagoVenta, ProductoVenta, VentaDetalle } from '@/lib/dominio';
import { formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { AbrirCaja } from '@/pages/caja/Caja';
import { useTurnoActual } from '@/pages/caja/turno-actual';

interface Linea {
  producto: ProductoVenta;
  cantidad: number;
}

/** Los montos se calculan en centavos enteros para evitar errores de punto flotante. */
const centavos = (monto: string | number) => Math.round(Number(monto) * 100);
const quetzales = (c: number) => formatearMoneda(c / 100);
const MONTO = /^\d+(\.\d{1,2})?$/;

function Resultados({ q, onAgregar }: { q: string; onAgregar: (p: ProductoVenta) => void }) {
  const busqueda = useDebounce(q.trim(), 250);
  const consulta = useQuery({
    queryKey: ['ventas', 'productos', busqueda],
    queryFn: () => api.get<ProductoVenta[]>(`/ventas/productos${query({ q: busqueda })}`),
    placeholderData: (previo) => previo,
  });
  if (consulta.isPending) {
    return <Cargando />;
  }
  if (consulta.error) {
    return <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />;
  }
  if (consulta.data.length === 0) {
    return (
      <p className="m-0 px-4 py-6 text-denso text-texto-secundario">
        No hay productos que coincidan con «{busqueda}».
      </p>
    );
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-4 sm:grid-cols-2">
      {consulta.data.map((p) => {
        const agotado = p.vigente === 0;
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={agotado}
              onClick={() => onAgregar(p)}
              className={cn(
                'flex min-h-20 w-full flex-col items-start gap-1 rounded-control border border-borde bg-superficie px-3 py-2 text-left transition-colors',
                agotado
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:border-verde-botica hover:bg-salvia',
              )}
            >
              <span className="text-denso font-semibold">{p.nombre}</span>
              <span className="text-meta text-texto-secundario">
                {p.sku} · {p.presentacion}
              </span>
              <span className="mt-auto flex w-full items-center justify-between gap-2">
                <span className="text-cuerpo font-semibold tabular-nums">
                  {formatearMoneda(p.precioVenta)}
                </span>
                <span
                  className={cn(
                    'text-meta tabular-nums',
                    agotado ? 'text-ladrillo' : 'text-texto-secundario',
                  )}
                >
                  {agotado ? 'Sin existencia' : `${p.vigente} disponibles`}
                </span>
              </span>
              {p.requiereReceta && <BadgeEstado tono="advertencia">Requiere receta</BadgeEstado>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DialogoCobro({
  lineas,
  abierto,
  onCerrar,
  onVendida,
}: {
  lineas: Linea[];
  abierto: boolean;
  onCerrar: () => void;
  onVendida: (venta: VentaDetalle, cambio: number) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent titulo="Cobrar" className="max-w-md">
          <FormularioCobro lineas={lineas} onCerrar={onCerrar} onVendida={onVendida} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function FormularioCobro({
  lineas,
  onCerrar,
  onVendida,
}: {
  lineas: Linea[];
  onCerrar: () => void;
  onVendida: (venta: VentaDetalle, cambio: number) => void;
}) {
  const total = lineas.reduce((s, l) => s + centavos(l.producto.precioVenta) * l.cantidad, 0);
  const [nit, setNit] = useState('CF');
  const [tarjeta, setTarjeta] = useState('');
  const [referencia, setReferencia] = useState('');
  const [recibido, setRecibido] = useState('');
  const [enviado, setEnviado] = useState(false);

  const enTarjeta =
    tarjeta.trim() === '' ? 0 : MONTO.test(tarjeta.trim()) ? centavos(tarjeta) : NaN;
  const errorTarjeta = Number.isNaN(enTarjeta)
    ? 'Monto con máximo 2 decimales'
    : enTarjeta > total
      ? 'No puede ser mayor que el total'
      : undefined;
  const efectivo = errorTarjeta ? 0 : total - enTarjeta;
  const enEfectivo =
    recibido.trim() === '' ? 0 : MONTO.test(recibido.trim()) ? centavos(recibido) : NaN;
  const errorRecibido =
    efectivo === 0
      ? undefined
      : Number.isNaN(enEfectivo)
        ? 'Monto con máximo 2 decimales'
        : enEfectivo < efectivo
          ? `Debe recibir al menos ${quetzales(efectivo)}`
          : undefined;
  const cambio = efectivo > 0 && !errorRecibido ? enEfectivo - efectivo : 0;
  const errorNit =
    /^(CF|C\/F|\d{1,12}-?[\dK])$/i.test(nit.trim().replace(/\s/g, '')) || nit.trim() === ''
      ? undefined
      : 'Dígitos con verificador (puede ser K), o CF';
  const receta = lineas.filter((l) => l.producto.requiereReceta);

  const vender = useMutacion(
    () => {
      const pagos: PagoVenta[] = [];
      if (enTarjeta > 0) {
        pagos.push({
          metodo: 'TARJETA',
          monto: (enTarjeta / 100).toFixed(2),
          referencia: referencia.trim() || undefined,
        });
      }
      if (efectivo > 0) {
        pagos.push({ metodo: 'EFECTIVO', monto: (efectivo / 100).toFixed(2) });
      }
      return api.post<VentaDetalle>('/ventas', {
        nit: nit.trim() || 'CF',
        items: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        pagos: pagos.map((p) => ({ ...p, monto: Number(p.monto) })),
      });
    },
    {
      invalidar: [['caja'], ['ventas'], ['inventario']],
      exito: (v) => `Venta #${v.numero} registrada`,
    },
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!errorTarjeta && !errorRecibido && !errorNit) {
          vender.mutate(undefined, { onSuccess: (v) => onVendida(v, cambio) });
        }
      }}
    >
      {vender.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={vender.error} />
        </div>
      )}
      <p className="m-0 mb-4 flex items-baseline justify-between">
        <span className="text-denso text-texto-secundario">Total a cobrar</span>
        <span className="text-pagina font-semibold tabular-nums">{quetzales(total)}</span>
      </p>
      {receta.length > 0 && (
        <p className="m-0 mb-4 rounded-control bg-ambar-fondo px-3 py-2 text-denso text-ambar">
          Solicite la receta de: {receta.map((l) => l.producto.nombre).join(', ')}.
        </p>
      )}
      <div className="flex flex-col gap-4">
        <Campo id="nit" etiqueta="NIT del cliente" error={enviado ? errorNit : undefined}>
          <Input
            id="nit"
            className="h-12 w-48 uppercase"
            aria-invalid={enviado && !!errorNit}
            value={nit}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setNit(e.target.value)}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            id="tarjeta"
            etiqueta="Pago con tarjeta (Q)"
            ayuda="Vacío si paga todo en efectivo"
            error={enviado ? errorTarjeta : undefined}
          >
            <Input
              id="tarjeta"
              inputMode="decimal"
              className="h-12 text-right tabular-nums"
              aria-invalid={enviado && !!errorTarjeta}
              value={tarjeta}
              onChange={(e) => setTarjeta(e.target.value)}
            />
          </Campo>
          <Campo id="referencia" etiqueta="Autorización">
            <Input
              id="referencia"
              className="h-12"
              disabled={enTarjeta <= 0}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </Campo>
        </div>
        {efectivo > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Campo
              id="recibido"
              etiqueta={`Efectivo recibido (cobrar ${quetzales(efectivo)})`}
              error={enviado ? errorRecibido : undefined}
            >
              <Input
                id="recibido"
                inputMode="decimal"
                autoFocus
                className="h-12 text-right tabular-nums"
                aria-invalid={enviado && !!errorRecibido}
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
              />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <span className="text-denso font-semibold">Cambio</span>
              <span className="flex h-12 items-center justify-end text-seccion font-semibold tabular-nums">
                {quetzales(cambio)}
              </span>
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onCerrar}>
          Volver al ticket
        </Button>
        <Button type="submit" variant="primario" size="lg" disabled={vender.isPending}>
          {vender.isPending ? 'Registrando venta...' : 'Registrar venta'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PuntoVenta() {
  const turno = useTurnoActual();
  const [q, setQ] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [ultima, setUltima] = useState<{ venta: VentaDetalle; cambio: number } | null>(null);

  const total = lineas.reduce((s, l) => s + centavos(l.producto.precioVenta) * l.cantidad, 0);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  const cambiarCantidad = (producto: ProductoVenta, cantidad: number) => {
    if (cantidad > producto.vigente) {
      toast.error(`Solo hay ${producto.vigente} unidades vigentes de ${producto.nombre}`);
      cantidad = producto.vigente;
    }
    setLineas((ls) =>
      cantidad <= 0
        ? ls.filter((l) => l.producto.id !== producto.id)
        : ls.some((l) => l.producto.id === producto.id)
          ? ls.map((l) => (l.producto.id === producto.id ? { ...l, cantidad } : l))
          : [...ls, { producto, cantidad }],
    );
  };
  const agregar = (producto: ProductoVenta) =>
    cambiarCantidad(
      producto,
      (lineas.find((l) => l.producto.id === producto.id)?.cantidad ?? 0) + 1,
    );

  if (turno.isPending) {
    return (
      <Pagina>
        <Cargando />
      </Pagina>
    );
  }
  if (turno.error) {
    return (
      <Pagina>
        <PanelError error={turno.error} onReintentar={() => void turno.refetch()} />
      </Pagina>
    );
  }
  if (!turno.data) {
    return (
      <Pagina>
        <EncabezadoPagina titulo="Punto de venta" />
        <AbrirCaja />
      </Pagina>
    );
  }

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Punto de venta"
        descripcion={`${turno.data.ubicacion.nombre} · los lotes se asignan solos, empezando por el que vence primero`}
        acciones={
          <Button asChild>
            <Link to="/caja">Ver caja</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Panel className="min-w-0 self-start">
          <div className="border-b border-borde p-4">
            <label className="relative block">
              <span className="sr-only">Buscar producto</span>
              <Search
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
              />
              <Input
                type="search"
                autoFocus
                placeholder="Buscar por nombre, SKU o principio activo"
                className="h-12 pl-10 text-cuerpo"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
          <Resultados q={q} onAgregar={agregar} />
        </Panel>

        <Panel className="flex flex-col self-start lg:sticky lg:top-4">
          <h2 className="m-0 flex items-baseline justify-between border-b border-borde px-4 py-3 text-seccion font-semibold">
            Ticket
            <span className="text-denso font-normal text-texto-secundario">
              {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
            </span>
          </h2>
          {lineas.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-denso text-texto-secundario">
              Busque un producto y tóquelo para agregarlo.
            </p>
          ) : (
            <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-0">
              {lineas.map((l) => (
                <li key={l.producto.id} className="border-b border-borde px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-denso font-semibold">{l.producto.nombre}</span>
                      <span className="text-meta text-texto-secundario tabular-nums">
                        {formatearMoneda(l.producto.precioVenta)} c/u
                      </span>
                    </div>
                    <span className="text-denso font-semibold tabular-nums whitespace-nowrap">
                      {quetzales(centavos(l.producto.precioVenta) * l.cantidad)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="icono"
                      aria-label={`Quitar una unidad de ${l.producto.nombre}`}
                      onClick={() => cambiarCantidad(l.producto, l.cantidad - 1)}
                    >
                      <Minus size={16} strokeWidth={1.75} />
                    </Button>
                    <Input
                      inputMode="numeric"
                      aria-label={`Cantidad de ${l.producto.nombre}`}
                      className="h-10 w-16 text-center tabular-nums"
                      value={l.cantidad}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''));
                        if (n > 0) {
                          cambiarCantidad(l.producto, n);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="icono"
                      aria-label={`Agregar una unidad de ${l.producto.nombre}`}
                      onClick={() => cambiarCantidad(l.producto, l.cantidad + 1)}
                    >
                      <Plus size={16} strokeWidth={1.75} />
                    </Button>
                    <Button
                      type="button"
                      size="icono"
                      variant="terciario"
                      className="ml-auto"
                      aria-label={`Quitar ${l.producto.nombre} del ticket`}
                      onClick={() => cambiarCantidad(l.producto, 0)}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </Button>
                  </div>
                  {l.producto.requiereReceta && (
                    <div className="mt-2">
                      <BadgeEstado tono="advertencia">Requiere receta</BadgeEstado>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-borde bg-fondo px-4 py-4">
            <p className="m-0 flex items-baseline justify-between">
              <span className="text-cuerpo font-semibold">Total</span>
              <span className="text-[2rem] leading-tight font-semibold tabular-nums">
                {quetzales(total)}
              </span>
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="lg"
                disabled={lineas.length === 0}
                onClick={() => setLineas([])}
              >
                Vaciar
              </Button>
              <Button
                type="button"
                variant="primario"
                size="lg"
                className="flex-1"
                disabled={lineas.length === 0}
                onClick={() => setCobrando(true)}
              >
                Cobrar
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <DialogoCobro
        lineas={lineas}
        abierto={cobrando}
        onCerrar={() => setCobrando(false)}
        onVendida={(venta, cambio) => {
          setCobrando(false);
          setLineas([]);
          setQ('');
          setUltima({ venta, cambio });
        }}
      />
      <Dialog open={ultima !== null} onOpenChange={(a) => !a && setUltima(null)}>
        {ultima && (
          <DialogContent titulo={`Venta #${ultima.venta.numero} registrada`} className="max-w-sm">
            <p className="m-0 text-denso text-texto-secundario">Cambio para el cliente</p>
            <p className="m-0 text-[2.5rem] leading-tight font-semibold tabular-nums">
              {quetzales(ultima.cambio)}
            </p>
            <DialogFooter>
              <Button asChild>
                <Link to={`/ventas/${ultima.venta.id}/comprobante`} target="_blank">
                  Imprimir comprobante
                </Link>
              </Button>
              <Button variant="primario" autoFocus onClick={() => setUltima(null)}>
                Nueva venta
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Pagina>
  );
}
