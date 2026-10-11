import { ArrowRight, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { usePuedeSolicitarTraslado } from '@/auth/permisos';
import { esGlobal, useUsuario } from '@/auth/sesion';
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
import { Input, Label, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListado } from '@/lib/consultas';
import {
  ESTADOS_TRASLADO,
  MOTIVOS_TRASLADO,
  type EstadoTraslado,
  type TrasladoResumen,
} from '@/lib/dominio';
import { formatearFechaHora } from '@/lib/formato';

const TONO_TRASLADO: Record<EstadoTraslado, TonoEstado> = {
  SOLICITADO: 'advertencia',
  APROBADO: 'proceso',
  EN_TRANSITO: 'proceso',
  RECIBIDO: 'correcto',
  CANCELADO: 'neutro',
};

export function BadgeTraslado({ estado }: { estado: EstadoTraslado }) {
  return <BadgeEstado tono={TONO_TRASLADO[estado]}>{ESTADOS_TRASLADO[estado]}</BadgeEstado>;
}

export function Traslados() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const puedeSolicitar = usePuedeSolicitarTraslado();
  const { ubicacionId } = useFiltroUbicacion();
  const listado = useListado<
    TrasladoResumen,
    { q: string; estado: string; direccion: string; desde: string; hasta: string }
  >(
    'traslados',
    { q: '', estado: '', direccion: '', desde: '', hasta: '' },
    { extra: esGlobal(usuario) ? { ubicacionId } : {} },
  );
  // La dirección solo tiene sentido respecto a una ubicación concreta.
  const hayUbicacion = ubicacionId !== '';

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Traslados"
        descripcion="Envíos de producto de la bodega a las sucursales y entre sucursales."
        acciones={
          puedeSolicitar && (
            <Button variant="primario" onClick={() => navegar('/traslados/nuevo')}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Solicitar traslado
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
              placeholder="Número o producto"
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
              {Object.entries(ESTADOS_TRASLADO).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </div>
          {hayUbicacion && (
            <div className="flex w-full flex-col gap-1 sm:w-44">
              <Label htmlFor="f-direccion">Dirección</Label>
              <Select
                id="f-direccion"
                value={listado.filtros.direccion}
                onChange={(e) => listado.setFiltro('direccion', e.target.value)}
              >
                <option value="">Entrantes y salientes</option>
                <option value="ENTRANTE">Entrantes</option>
                <option value="SALIENTE">Salientes</option>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-desde">Solicitado desde</Label>
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
            texto="Aún no hay traslados con estos filtros."
            accion={
              puedeSolicitar && (
                <Button onClick={() => navegar('/traslados/nuevo')}>Solicitar traslado</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Origen y destino</TableHead>
                  <TableHead numerico>Productos</TableHead>
                  <TableHead numerico>Unidades</TableHead>
                  <TableHead>Solicitado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/traslados/${t.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/traslados/${t.id}`}
                        className="font-semibold text-verde-botica tabular-nums"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{t.numero}
                      </Link>
                      <span className="block text-meta text-texto-secundario">
                        {MOTIVOS_TRASLADO[t.motivo]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <BadgeTraslado estado={t.estado} />
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>{t.origen.nombre}</span>
                        <ArrowRight
                          size={14}
                          strokeWidth={1.75}
                          className="text-texto-secundario"
                          aria-label="hacia"
                        />
                        <span className="font-semibold">{t.destino.nombre}</span>
                      </span>
                    </TableCell>
                    <TableCell numerico>{t.productos}</TableCell>
                    <TableCell numerico>{t.unidades}</TableCell>
                    <TableCell>
                      <span className="tabular-nums whitespace-nowrap">
                        {formatearFechaHora(t.fechaSolicitud)}
                      </span>
                      <span className="block text-meta text-texto-secundario">
                        {t.solicitadoPor.nombre}
                      </span>
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
