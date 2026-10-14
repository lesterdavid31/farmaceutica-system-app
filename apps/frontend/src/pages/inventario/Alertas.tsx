import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { tieneRol, useUsuario } from '@/auth/sesion';
import { EtiquetaLote } from '@/components/EtiquetaLote';
import { Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query, type Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useMutacion } from '@/lib/consultas';
import type { Alertas as RespuestaAlertas, ExistenciaAlerta, Ubicacion } from '@/lib/dominio';
import type { PrecargaTraslado } from '@/pages/traslados/NuevoTraslado';
import { formatearFecha, formatearMoneda } from '@/lib/formato';
import { BotonCsv } from '@/components/BotonCsv';
import { descargarCsv, diaCsv } from '@/lib/csv';

function Seccion({
  titulo,
  cantidad,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  cantidad: number;
  descripcion: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-4 py-3">
        <div>
          <h2 className="m-0 text-seccion font-semibold">
            {titulo} <span className="text-texto-secundario tabular-nums">({cantidad})</span>
          </h2>
          <p className="m-0 mt-1 text-denso text-texto-secundario">{descripcion}</p>
        </div>
        {acciones}
      </div>
      {children}
    </Panel>
  );
}

function SinPendientes({ texto }: { texto: string }) {
  return <p className="m-0 px-4 py-6 text-denso text-texto-secundario">{texto}</p>;
}

export function Alertas() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const puedeGestionar = tieneRol(usuario, ['ADMIN', 'GERENTE']);
  const navegar = useNavigate();
  // La bodega no recibe traslados (compra a proveedores): sus faltantes no ofrecen traslado.
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const recibeTraslados = (id: string) =>
    ubicaciones.data?.data.some((u) => u.id === id && u.tipo !== 'BODEGA_CENTRAL') ?? false;
  const consulta = useQuery({
    queryKey: ['inventario', 'alertas', ubicacionId],
    queryFn: () => api.get<RespuestaAlertas>(`/inventario/alertas${query({ ubicacionId })}`),
  });
  const [baja, setBaja] = useState<ExistenciaAlerta | 'todos' | null>(null);

  const darDeBaja = useMutacion(
    (objetivo: ExistenciaAlerta | 'todos') =>
      api.post<{ lotes: number; unidades: number }>(
        '/inventario/bajas',
        objetivo === 'todos'
          ? { ubicacionId }
          : { ubicacionId: objetivo.ubicacion.id, loteId: objetivo.lote.id },
      ),
    {
      invalidar: [['inventario']],
      exito: (r) =>
        r.lotes === 1
          ? 'Lote dado de baja'
          : `${r.lotes} lotes dados de baja (${r.unidades} unidades)`,
      errorEnToast: true,
    },
  );

  const mostrarUbicacion = !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Alertas de inventario"
        descripcion={
          consulta.data
            ? `Lotes vencidos, lotes que vencen en los próximos ${consulta.data.diasAlerta} días y productos bajo el stock mínimo.`
            : 'Lotes vencidos, próximos a vencer y productos bajo el stock mínimo.'
        }
        acciones={
          consulta.data && (
            <BotonCsv
              exportar={() => {
                const d = consulta.data;
                const lotes = (alerta: string, lista: ExistenciaAlerta[]) =>
                  lista.map((e) => ({
                    alerta,
                    producto: e.lote.producto.nombre,
                    sku: e.lote.producto.sku,
                    lote: e.lote.numeroLote,
                    vencimiento: diaCsv(e.lote.fechaVencimiento),
                    ubicacion: e.ubicacion.nombre,
                    cantidad: e.cantidad,
                    minimo: '',
                    sugerido: '',
                  }));
                descargarCsv(
                  'alertas-de-inventario',
                  [
                    { titulo: 'Alerta', valor: (f) => f.alerta },
                    { titulo: 'SKU', valor: (f) => f.sku },
                    { titulo: 'Producto', valor: (f) => f.producto },
                    { titulo: 'Lote', valor: (f) => f.lote },
                    { titulo: 'Vencimiento', valor: (f) => f.vencimiento },
                    { titulo: 'Ubicación', valor: (f) => f.ubicacion },
                    { titulo: 'Cantidad', valor: (f) => f.cantidad },
                    { titulo: 'Stock mínimo', valor: (f) => f.minimo },
                    { titulo: 'Sugerido', valor: (f) => f.sugerido },
                  ],
                  [
                    ...lotes('Vencido', d.vencidos),
                    ...lotes('Por vencer', d.porVencer),
                    ...d.bajoMinimo.map((b) => ({
                      alerta: 'Bajo stock mínimo',
                      producto: b.producto.nombre,
                      sku: b.producto.sku,
                      lote: '',
                      vencimiento: '',
                      ubicacion: b.ubicacion.nombre,
                      cantidad: b.vigente,
                      minimo: String(b.cantidadMinima),
                      sugerido: String(b.sugerido),
                    })),
                  ],
                );
              }}
            />
          )
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
        <>
          <Seccion
            titulo="Vencidos pendientes de baja"
            cantidad={consulta.data.vencidos.length}
            descripcion="No se pueden vender ni trasladar. Deles de baja para retirarlos del inventario."
            acciones={
              puedeGestionar &&
              ubicacionId &&
              consulta.data.vencidos.length > 1 && (
                <Button variant="destructivo" onClick={() => setBaja('todos')}>
                  Dar de baja todos los vencidos
                </Button>
              )
            }
          >
            {consulta.data.vencidos.length === 0 ? (
              <SinPendientes texto="No hay lotes vencidos pendientes de baja." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                    <TableHead numerico>Unidades</TableHead>
                    <TableHead numerico>Costo perdido</TableHead>
                    {puedeGestionar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consulta.data.vencidos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="font-semibold">{e.lote.producto.nombre}</span>
                        <span className="block text-meta text-texto-secundario">
                          {e.lote.producto.sku}
                        </span>
                      </TableCell>
                      <TableCell>
                        <EtiquetaLote
                          numeroLote={e.lote.numeroLote}
                          fechaVencimiento={e.lote.fechaVencimiento}
                          vigencia="VENCIDO"
                          diasParaVencer={e.diasParaVencer}
                        />
                      </TableCell>
                      {mostrarUbicacion && <TableCell>{e.ubicacion.nombre}</TableCell>}
                      <TableCell numerico>{e.cantidad}</TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(Number(e.lote.costoUnitario) * e.cantidad)}
                      </TableCell>
                      {puedeGestionar && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructivo" onClick={() => setBaja(e)}>
                            Dar de baja
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Seccion>

          <Seccion
            titulo="Próximos a vencer"
            cantidad={consulta.data.porVencer.length}
            descripcion="Priorice su venta o trasládelos a una sucursal con más rotación."
          >
            {consulta.data.porVencer.length === 0 ? (
              <SinPendientes texto="No hay lotes próximos a vencer." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                    <TableHead numerico>Unidades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consulta.data.porVencer.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="font-semibold">{e.lote.producto.nombre}</span>
                        <span className="block text-meta text-texto-secundario">
                          {e.lote.producto.sku}
                        </span>
                      </TableCell>
                      <TableCell>
                        <EtiquetaLote
                          numeroLote={e.lote.numeroLote}
                          fechaVencimiento={e.lote.fechaVencimiento}
                          vigencia="POR_VENCER"
                          diasParaVencer={e.diasParaVencer}
                        />
                      </TableCell>
                      {mostrarUbicacion && <TableCell>{e.ubicacion.nombre}</TableCell>}
                      <TableCell numerico>{e.cantidad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Seccion>

          <Seccion
            titulo="Bajo stock mínimo"
            cantidad={consulta.data.bajoMinimo.length}
            descripcion="La cantidad sugerida repone hasta el doble del mínimo. Solicite un traslado desde la bodega o desde otra sucursal."
          >
            {consulta.data.bajoMinimo.length === 0 ? (
              <SinPendientes texto="Ningún producto está por debajo de su stock mínimo." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                    <TableHead numerico>Vigente</TableHead>
                    <TableHead numerico>Mínimo</TableHead>
                    <TableHead numerico>Sugerido</TableHead>
                    {puedeGestionar && (
                      <TableHead>
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consulta.data.bajoMinimo.map((b) => (
                    <TableRow key={`${b.ubicacion.id}-${b.producto.id}`}>
                      <TableCell>
                        <span className="font-semibold">{b.producto.nombre}</span>
                        <span className="block text-meta text-texto-secundario">
                          {b.producto.sku}
                        </span>
                      </TableCell>
                      {mostrarUbicacion && <TableCell>{b.ubicacion.nombre}</TableCell>}
                      <TableCell
                        numerico
                        className={b.vigente === 0 ? 'font-semibold text-ladrillo' : 'text-ambar'}
                      >
                        {b.vigente}
                      </TableCell>
                      <TableCell numerico>{b.cantidadMinima}</TableCell>
                      <TableCell numerico className="font-semibold">
                        {b.sugerido}
                      </TableCell>
                      {puedeGestionar && (
                        <TableCell className="text-right">
                          {recibeTraslados(b.ubicacion.id) && (
                            <Button
                              size="sm"
                              onClick={() =>
                                navegar('/traslados/nuevo', {
                                  state: {
                                    destinoId: b.ubicacion.id,
                                    producto: { ...b.producto, presentacion: '' },
                                    cantidad: b.sugerido,
                                  } satisfies PrecargaTraslado,
                                })
                              }
                            >
                              Solicitar traslado
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Seccion>
        </>
      )}

      <ConfirmDialog
        abierto={baja !== null}
        onAbiertoChange={(a) => !a && setBaja(null)}
        titulo={baja === 'todos' ? 'Dar de baja todos los vencidos' : 'Dar de baja lote vencido'}
        descripcion={
          baja === 'todos'
            ? `Se retirarán ${consulta.data?.vencidos.length ?? 0} lotes vencidos de esta ubicación. Cada baja queda registrada en el kardex y no se puede deshacer.`
            : baja &&
              `Se retirarán ${baja.cantidad} unidades del lote ${baja.lote.numeroLote} de ${baja.lote.producto.nombre}, vencido el ${formatearFecha(baja.lote.fechaVencimiento)}. Quedará registrado en el kardex y no se puede deshacer.`
        }
        textoConfirmar={baja === 'todos' ? 'Dar de baja todos' : 'Dar de baja lote'}
        destructivo
        pendiente={darDeBaja.isPending}
        onConfirmar={() => baja && darDeBaja.mutate(baja, { onSettled: () => setBaja(null) })}
      />
    </Pagina>
  );
}
