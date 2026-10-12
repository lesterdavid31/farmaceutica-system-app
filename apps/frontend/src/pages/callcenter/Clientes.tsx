import { useQuery } from '@tanstack/react-query';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { tieneRol, useUsuario } from '@/auth/sesion';
import { BadgeEstado } from '@/components/BadgeEstado';
import { MapaPunto } from '@/components/MapaPunto';
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
import { Input, Label } from '@/components/ui/input';
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
  ESTADOS_PEDIDO,
  type Cliente,
  type ClienteDetalle,
  type DireccionCliente,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { DialogoCliente, DialogoDireccion } from './dialogos-cliente';

export function Clientes() {
  const navegar = useNavigate();
  const puedeEditar = tieneRol(useUsuario(), ['ADMIN', 'OPERADOR_CALL_CENTER']);
  const [nuevo, setNuevo] = useState(false);
  const listado = useListado<Cliente, { q: string }>('clientes', { q: '' });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Clientes del call center con sus direcciones de entrega."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setNuevo(true)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Registrar cliente
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-80">
            <Label htmlFor="f-q">Buscar</Label>
            <Input
              id="f-q"
              type="search"
              autoFocus
              placeholder="Teléfono, nombre o NIT"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="No hay clientes con esta búsqueda."
            accion={
              puedeEditar && <Button onClick={() => setNuevo(true)}>Registrar cliente</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Dirección principal</TableHead>
                  <TableHead numerico>Pedidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/call-center/clientes/${c.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/call-center/clientes/${c.id}`}
                        className="font-semibold text-verde-botica"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.nombre}
                      </Link>
                      {!c.activo && (
                        <span className="ml-2">
                          <BadgeEstado tono="neutro">Inactivo</BadgeEstado>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.telefono}</TableCell>
                    <TableCell className="tabular-nums">{c.nit ?? 'CF'}</TableCell>
                    <TableCell>{c.direcciones[0]?.direccion ?? 'Sin dirección'}</TableCell>
                    <TableCell numerico>{c._count?.pedidos ?? 0}</TableCell>
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
      <DialogoCliente
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        onListo={(c) => navegar(`/call-center/clientes/${c.id}`)}
      />
    </Pagina>
  );
}

export function DetalleCliente() {
  const { id } = useParams();
  const puedeEditar = tieneRol(useUsuario(), ['ADMIN', 'OPERADOR_CALL_CENTER']);
  const [editando, setEditando] = useState(false);
  const [direccion, setDireccion] = useState<DireccionCliente | 'nueva' | null>(null);
  const consulta = useQuery({
    queryKey: ['clientes', 'detalle', id],
    queryFn: () => api.get<ClienteDetalle>(`/clientes/${id}`),
  });
  const cliente = consulta.data;
  const desactivar = useMutacion(
    (d: DireccionCliente) =>
      api.patch(`/clientes/${id}/direcciones/${d.id}`, { activa: !d.activa }),
    { invalidar: [['clientes']], exito: 'Dirección actualizada', errorEnToast: true },
  );

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={cliente?.nombre ?? 'Cliente'}
        descripcion={cliente && `Tel. ${cliente.telefono} · NIT ${cliente.nit ?? 'CF'}`}
        acciones={
          <>
            {puedeEditar && cliente && (
              <>
                <Button onClick={() => setEditando(true)}>
                  <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                  Editar cliente
                </Button>
                <Button asChild variant="primario">
                  <Link to={`/call-center/nuevo-pedido?clienteId=${cliente.id}`}>Crear pedido</Link>
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/call-center/clientes">Volver a clientes</Link>
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
        cliente && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <div className="flex items-center justify-between border-b border-borde px-4 py-3">
                <h2 className="m-0 text-seccion font-semibold">Direcciones</h2>
                {puedeEditar && (
                  <Button size="sm" onClick={() => setDireccion('nueva')}>
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Agregar dirección
                  </Button>
                )}
              </div>
              {cliente.direcciones.length === 0 ? (
                <EstadoVacio texto="El cliente aún no tiene direcciones. Agregue una para crear pedidos." />
              ) : (
                <ul className="m-0 list-none p-0">
                  {cliente.direcciones.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start gap-3 border-b border-borde px-4 py-3 last:border-b-0"
                    >
                      <MapPin
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-texto-secundario"
                      />
                      <div className="min-w-0 flex-1 text-denso">
                        <span className="font-semibold">{d.alias ?? 'Dirección'}</span>
                        {d.principal && (
                          <span className="ml-2">
                            <BadgeEstado tono="correcto">Principal</BadgeEstado>
                          </span>
                        )}
                        {!d.activa && (
                          <span className="ml-2">
                            <BadgeEstado tono="neutro">Inactiva</BadgeEstado>
                          </span>
                        )}
                        <span className="block">{d.direccion}</span>
                        {d.referencia && (
                          <span className="block text-texto-secundario">{d.referencia}</span>
                        )}
                        <span className="block text-meta text-texto-secundario tabular-nums">
                          {Number(d.latitud).toFixed(5)}, {Number(d.longitud).toFixed(5)}
                        </span>
                      </div>
                      {puedeEditar && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="terciario" onClick={() => setDireccion(d)}>
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="terciario"
                            disabled={desactivar.isPending}
                            onClick={() => desactivar.mutate(d)}
                          >
                            {d.activa ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {cliente.direcciones.some((d) => d.activa) && (
                <div className="border-t border-borde p-4">
                  <MapaPunto
                    valor={null}
                    marcadores={cliente.direcciones
                      .filter((d) => d.activa)
                      .map((d) => ({
                        id: d.id,
                        etiqueta: d.alias ?? d.direccion,
                        latitud: Number(d.latitud),
                        longitud: Number(d.longitud),
                        destacado: d.principal,
                      }))}
                    className="h-56"
                  />
                </div>
              )}
            </Panel>
            <Panel className="self-start">
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Últimos pedidos
              </h2>
              {cliente.pedidos.length === 0 ? (
                <EstadoVacio texto="El cliente aún no tiene pedidos." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead numerico>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cliente.pedidos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link
                            to={`/pedidos/${p.id}`}
                            className="font-semibold text-verde-botica tabular-nums"
                          >
                            #{p.numero}
                          </Link>
                          <span className="block text-meta text-texto-secundario tabular-nums">
                            {formatearFechaHora(p.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>{p.ubicacionDespacho.nombre}</TableCell>
                        <TableCell>{ESTADOS_PEDIDO[p.estado]}</TableCell>
                        <TableCell numerico className="whitespace-nowrap">
                          {formatearMoneda(p.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>
        )
      )}
      {cliente && (
        <>
          <DialogoCliente
            abierto={editando}
            cliente={cliente}
            onCerrar={() => setEditando(false)}
          />
          <DialogoDireccion
            abierto={direccion !== null}
            clienteId={cliente.id}
            direccion={direccion === 'nueva' || direccion === null ? undefined : direccion}
            onCerrar={() => setDireccion(null)}
          />
        </>
      )}
    </Pagina>
  );
}
