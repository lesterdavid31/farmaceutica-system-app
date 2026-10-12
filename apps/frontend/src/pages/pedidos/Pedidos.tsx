import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, tieneRol, useUsuario } from '@/auth/sesion';
import { BadgeEstado, type TonoEstado } from '@/components/BadgeEstado';
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
import { Checkbox, Input, Label, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListado } from '@/lib/consultas';
import { ESTADOS_PEDIDO, type EstadoPedido, type PedidoResumen } from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

const TONO_PEDIDO: Record<EstadoPedido, TonoEstado> = {
  PENDIENTE: 'neutro',
  EN_PREPARACION: 'proceso',
  ASIGNADO: 'proceso',
  EN_CAMINO: 'proceso',
  ENTREGADO: 'correcto',
  CANCELADO: 'neutro',
};

export function BadgePedido({ estado }: { estado: EstadoPedido }) {
  return <BadgeEstado tono={TONO_PEDIDO[estado]}>{ESTADOS_PEDIDO[estado]}</BadgeEstado>;
}

/** RN-18: los pedidos atrasados se resaltan en ladrillo con los minutos de atraso. */
export function BadgeAtraso({ minutos }: { minutos: number }) {
  const texto =
    minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  return <BadgeEstado tono="peligro">Atrasado {texto}</BadgeEstado>;
}

export function Pedidos() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const global = esGlobal(usuario);
  const { ubicacionId } = useFiltroUbicacion();
  const puedeCrear = tieneRol(usuario, ['ADMIN', 'OPERADOR_CALL_CENTER']);
  const sucursal = tieneRol(usuario, ['GERENTE', 'CAJERO']);
  const listado = useListado<
    PedidoResumen,
    { q: string; estado: string; activos: boolean; atrasados: boolean }
  >(
    'pedidos',
    // La bandeja de la sucursal muestra por defecto lo que falta atender.
    { q: '', estado: '', activos: sucursal, atrasados: false },
    { extra: global ? { ubicacionId } : {} },
  );
  const mostrarSucursal = global && !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={sucursal ? 'Pedidos de la sucursal' : 'Seguimiento de pedidos'}
        descripcion={
          sucursal
            ? 'Prepare los pedidos, asigne repartidor y confirme la entrega con el cobro.'
            : 'Pedidos del call center con su estado y los atrasados resaltados.'
        }
        acciones={
          puedeCrear && (
            <Button variant="primario" onClick={() => navegar('/call-center/nuevo-pedido')}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Nuevo pedido
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <Label htmlFor="f-q">Buscar</Label>
            <Input
              id="f-q"
              type="search"
              placeholder="Número, teléfono o cliente"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-44">
            <Label htmlFor="f-estado">Estado</Label>
            <Select
              id="f-estado"
              value={listado.filtros.estado}
              onChange={(e) => listado.setFiltro('estado', e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(ESTADOS_PEDIDO).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex h-10 items-center gap-2 text-denso">
            <Checkbox
              checked={listado.filtros.activos}
              onChange={(e) => listado.setFiltro('activos', e.target.checked)}
            />
            Sin entregar
          </label>
          <label className="flex h-10 items-center gap-2 text-denso">
            <Checkbox
              checked={listado.filtros.atrasados}
              onChange={(e) => listado.setFiltro('atrasados', e.target.checked)}
            />
            Solo atrasados
          </label>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto={
              sucursal
                ? 'No hay pedidos pendientes en la sucursal.'
                : 'Aún no hay pedidos con estos filtros.'
            }
            accion={
              puedeCrear && (
                <Button onClick={() => navegar('/call-center/nuevo-pedido')}>Crear pedido</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  {mostrarSucursal && <TableHead>Sucursal</TableHead>}
                  <TableHead>Estado</TableHead>
                  <TableHead>Compromiso</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead numerico>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((p) => (
                  <TableRow
                    key={p.id}
                    className={cn(
                      'cursor-pointer',
                      p.atrasado && 'bg-ladrillo-fondo/60 hover:bg-ladrillo-fondo',
                    )}
                    onClick={() => navegar(`/pedidos/${p.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/pedidos/${p.id}`}
                        className="font-semibold text-verde-botica tabular-nums"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{p.numero}
                      </Link>
                      <span className="block text-meta text-texto-secundario tabular-nums">
                        {formatearFechaHora(p.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.cliente.nombre}
                      <span className="block text-meta text-texto-secundario tabular-nums">
                        {p.cliente.telefono}
                      </span>
                    </TableCell>
                    {mostrarSucursal && <TableCell>{p.ubicacionDespacho.nombre}</TableCell>}
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <BadgePedido estado={p.estado} />
                        {p.atrasado && <BadgeAtraso minutos={p.minutosAtraso} />}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatearFechaHora(p.fechaCompromiso)}
                    </TableCell>
                    <TableCell>
                      {p.entrega
                        ? `${p.entrega.repartidor.nombres} ${p.entrega.repartidor.apellidos}`
                        : ''}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(p.total)}
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
