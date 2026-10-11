import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { usePuedeComprar } from '@/auth/permisos';
import { EtiquetaLote } from '@/components/EtiquetaLote';
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
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useListado } from '@/lib/consultas';
import type { CompraDetalle, CompraResumen, Proveedor } from '@/lib/dominio';
import { formatearFecha, formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { vigenciaLocal } from '@/lib/vigencia';

export function Compras() {
  const navegar = useNavigate();
  const puedeComprar = usePuedeComprar();
  const listado = useListado<
    CompraResumen,
    { q: string; proveedorId: string; desde: string; hasta: string }
  >('compras', { q: '', proveedorId: '', desde: '', hasta: '' });
  const proveedores = useCatalogo<PaginaApi<Proveedor>>('proveedores', '/proveedores?limit=100');

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Compras"
        descripcion="Compras de la bodega central a proveedores, con lote y vencimiento."
        acciones={
          puedeComprar && (
            <Button variant="primario" onClick={() => navegar('/compras/nueva')}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Registrar compra
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <Label htmlFor="f-doc">Documento</Label>
            <Input
              id="f-doc"
              type="search"
              placeholder="Número de factura"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-72">
            <Label htmlFor="f-proveedor">Proveedor</Label>
            <Select
              id="f-proveedor"
              value={listado.filtros.proveedorId}
              onChange={(e) => listado.setFiltro('proveedorId', e.target.value)}
            >
              <option value="">Todos los proveedores</option>
              {proveedores.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
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
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="Aún no hay compras con estos filtros."
            accion={
              puedeComprar && (
                <Button onClick={() => navegar('/compras/nueva')}>Registrar compra</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead numerico>Productos</TableHead>
                  <TableHead numerico>Total</TableHead>
                  <TableHead>Registró</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/compras/${c.id}`)}
                  >
                    <TableCell className="tabular-nums">{formatearFecha(c.fecha)}</TableCell>
                    <TableCell>
                      <Link
                        to={`/compras/${c.id}`}
                        className="font-semibold text-verde-botica"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.numeroDocumento ?? 'Sin documento'}
                      </Link>
                    </TableCell>
                    <TableCell>{c.proveedor.nombre}</TableCell>
                    <TableCell numerico>{c._count.detalles}</TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(c.total)}
                    </TableCell>
                    <TableCell>{c.usuario.nombre}</TableCell>
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

export function DetalleCompra() {
  const { id } = useParams();
  const consulta = useQuery({
    queryKey: ['compras', 'detalle', id],
    queryFn: () => api.get<CompraDetalle>(`/compras/${id}`),
  });
  const compra = consulta.data;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={compra ? `Compra ${compra.numeroDocumento ?? 'sin documento'}` : 'Compra'}
        descripcion={
          compra ? `${compra.proveedor.nombre} · NIT ${compra.proveedor.nit}` : undefined
        }
        acciones={
          <Button asChild>
            <Link to="/compras">Volver a compras</Link>
          </Button>
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
        compra && (
          <>
            <Panel className="mb-6">
              <dl className="m-0 grid gap-x-8 gap-y-3 p-4 text-denso sm:grid-cols-4">
                <div>
                  <dt className="text-texto-secundario">Fecha de la compra</dt>
                  <dd className="m-0 font-semibold tabular-nums">{formatearFecha(compra.fecha)}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Ingresó a</dt>
                  <dd className="m-0 font-semibold">{compra.ubicacion.nombre}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Registró</dt>
                  <dd className="m-0 font-semibold">{compra.usuario.nombre}</dd>
                  <dd className="m-0 text-meta text-texto-secundario tabular-nums">
                    {formatearFechaHora(compra.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Total</dt>
                  <dd className="m-0 text-seccion font-semibold tabular-nums">
                    {formatearMoneda(compra.total)}
                  </dd>
                </div>
                {compra.observaciones && (
                  <div className="sm:col-span-4">
                    <dt className="text-texto-secundario">Observaciones</dt>
                    <dd className="m-0">{compra.observaciones}</dd>
                  </div>
                )}
              </dl>
            </Panel>
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead numerico>Cantidad</TableHead>
                    <TableHead numerico>Costo unitario</TableHead>
                    <TableHead numerico>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compra.detalles.map((d) => (
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
                        {formatearMoneda(d.costoUnitario)}
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
                      {formatearMoneda(compra.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Panel>
          </>
        )
      )}
    </Pagina>
  );
}
