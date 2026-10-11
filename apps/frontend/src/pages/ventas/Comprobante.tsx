import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Logo } from '@/components/Logo';
import { Cargando, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { METODOS_PAGO, type VentaDetalle } from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';

/**
 * Comprobante interno imprimible (RF-19). No es una factura electrónica FEL (sección 11).
 * Se abre fuera del layout para que la impresión solo incluya el ticket.
 */
export function Comprobante() {
  const { id } = useParams();
  const consulta = useQuery({
    queryKey: ['ventas', 'detalle', id],
    queryFn: () => api.get<VentaDetalle>(`/ventas/${id}`),
  });
  const venta = consulta.data;

  // Una línea por producto: el comprobante no necesita el desglose por lote.
  const lineas = Object.values(
    (venta?.detalles ?? []).reduce<
      Record<string, { nombre: string; cantidad: number; precio: string; subtotal: number }>
    >((acc, d) => {
      const l = (acc[d.producto.id] ??= {
        nombre: d.producto.nombre,
        cantidad: 0,
        precio: d.precioUnitario,
        subtotal: 0,
      });
      l.cantidad += d.cantidad;
      l.subtotal += Number(d.subtotal);
      return acc;
    }, {}),
  );

  return (
    <main className="min-h-screen bg-fondo px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[360px] justify-end print:hidden">
        <Button variant="primario" onClick={() => window.print()} disabled={!venta}>
          <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
          Imprimir
        </Button>
      </div>
      <article className="mx-auto max-w-[360px] rounded-panel border border-borde bg-superficie p-6 text-denso print:max-w-none print:border-0 print:p-0">
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.error ? (
          <PanelError error={consulta.error} />
        ) : (
          venta && (
            <>
              <header className="mb-4 flex flex-col items-center gap-1 text-center">
                <Logo />
                <p className="m-0 font-semibold">{venta.ubicacion.nombre}</p>
                <p className="m-0 text-meta text-texto-secundario">{venta.ubicacion.direccion}</p>
                {venta.ubicacion.telefono && (
                  <p className="m-0 text-meta text-texto-secundario">
                    Tel. {venta.ubicacion.telefono}
                  </p>
                )}
              </header>
              <dl className="m-0 mb-3 grid grid-cols-2 gap-1 border-y border-dashed border-borde py-2 text-meta">
                <dt className="text-texto-secundario">Comprobante</dt>
                <dd className="m-0 text-right font-semibold tabular-nums">#{venta.numero}</dd>
                <dt className="text-texto-secundario">Fecha</dt>
                <dd className="m-0 text-right tabular-nums">
                  {formatearFechaHora(venta.createdAt)}
                </dd>
                <dt className="text-texto-secundario">NIT</dt>
                <dd className="m-0 text-right tabular-nums">{venta.nit}</dd>
                <dt className="text-texto-secundario">Atendió</dt>
                <dd className="m-0 text-right">{venta.usuario.nombre}</dd>
              </dl>
              <table className="w-full border-collapse">
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.nombre} className="align-top">
                      <td className="py-1 pr-2">
                        {l.nombre}
                        <span className="block text-meta text-texto-secundario tabular-nums">
                          {l.cantidad} × {formatearMoneda(l.precio)}
                        </span>
                      </td>
                      <td className="py-1 text-right tabular-nums whitespace-nowrap">
                        {formatearMoneda(l.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 border-t border-dashed border-borde pt-2">
                <p className="m-0 flex justify-between text-cuerpo font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatearMoneda(venta.total)}</span>
                </p>
                {venta.pagos.map((p) => (
                  <p key={p.id ?? p.metodo} className="m-0 flex justify-between text-meta">
                    <span>{METODOS_PAGO[p.metodo]}</span>
                    <span className="tabular-nums">{formatearMoneda(p.monto)}</span>
                  </p>
                ))}
              </div>
              {venta.estado === 'ANULADA' && (
                <p className="m-0 mt-3 border border-ladrillo py-1 text-center font-semibold text-ladrillo">
                  VENTA ANULADA
                </p>
              )}
              <p className="m-0 mt-4 text-center text-meta text-texto-secundario">
                Comprobante interno. No es una factura electrónica.
              </p>
            </>
          )
        )}
      </article>
    </main>
  );
}
