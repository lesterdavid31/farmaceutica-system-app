import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
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
import { api } from '@/lib/api';
import { useListado } from '@/lib/consultas';
import type { TurnoCajaDetalle, TurnoCajaResumen } from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { BadgeDiferencia, ResumenTurno, TablaMovimientos } from './componentes';

export function Turnos() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const listado = useListado<
    TurnoCajaResumen,
    { estado: string; conDiferencia: boolean; desde: string; hasta: string }
  >(
    'caja/turnos',
    { estado: '', conDiferencia: false, desde: '', hasta: '' },
    { extra: esGlobal(usuario) ? { ubicacionId } : {} },
  );
  const mostrarUbicacion = esGlobal(usuario) && !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Turnos de caja"
        descripcion={
          usuario.rol === 'CAJERO'
            ? 'Sus turnos de caja con el resultado del arqueo.'
            : 'Turnos de caja con el resultado del arqueo: sobrantes y faltantes.'
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <Label htmlFor="f-estado">Estado</Label>
            <Select
              id="f-estado"
              value={listado.filtros.estado}
              onChange={(e) => listado.setFiltro('estado', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="ABIERTO">Abiertos</option>
              <option value="CERRADO">Cerrados</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-desde">Apertura desde</Label>
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
          <label className="flex h-10 items-center gap-2 text-denso">
            <Checkbox
              checked={listado.filtros.conDiferencia}
              onChange={(e) => listado.setFiltro('conDiferencia', e.target.checked)}
            />
            Solo con diferencia
          </label>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio texto="No hay turnos de caja con estos filtros." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Cajero</TableHead>
                  {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                  <TableHead numerico>Ventas</TableHead>
                  <TableHead numerico>Esperado</TableHead>
                  <TableHead numerico>Contado</TableHead>
                  <TableHead>Arqueo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/caja/turnos/${t.id}`)}
                  >
                    <TableCell className="whitespace-nowrap">
                      <Link
                        to={`/caja/turnos/${t.id}`}
                        className="font-semibold text-verde-botica tabular-nums"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatearFechaHora(t.apertura)}
                      </Link>
                      {t.cierre && (
                        <span className="block text-meta text-texto-secundario tabular-nums">
                          Cierre {formatearFechaHora(t.cierre)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{t.cajero.nombre}</TableCell>
                    {mostrarUbicacion && <TableCell>{t.ubicacion.nombre}</TableCell>}
                    <TableCell numerico>{t._count.ventas}</TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {t.efectivoEsperado ? formatearMoneda(t.efectivoEsperado) : ''}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {t.efectivoContado ? formatearMoneda(t.efectivoContado) : ''}
                    </TableCell>
                    <TableCell>
                      <BadgeDiferencia diferencia={t.diferencia} />
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

export function DetalleTurno() {
  const { id } = useParams();
  const consulta = useQuery({
    queryKey: ['caja', 'turnos', 'detalle', id],
    queryFn: () => api.get<TurnoCajaDetalle>(`/caja/turnos/${id}`),
  });
  const turno = consulta.data;
  return (
    <Pagina>
      <EncabezadoPagina
        titulo={turno ? `Turno de ${turno.cajero.nombre}` : 'Turno de caja'}
        descripcion={
          turno &&
          `${turno.ubicacion.nombre} · apertura ${formatearFechaHora(turno.apertura)}${
            turno.cierre ? ` · cierre ${formatearFechaHora(turno.cierre)}` : ''
          }`
        }
        acciones={
          <>
            {turno && (
              <Button asChild>
                <Link to={`/ventas?turnoCajaId=${turno.id}`}>Ver ventas del turno</Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/caja/turnos">Volver a turnos</Link>
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
        turno && (
          <>
            <Panel className="mb-6">
              <ResumenTurno turno={turno} />
              {turno.observaciones && (
                <p className="m-0 border-t border-borde px-4 py-3 text-denso whitespace-pre-line">
                  <span className="text-texto-secundario">Observaciones: </span>
                  {turno.observaciones}
                </p>
              )}
            </Panel>
            <Panel>
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Movimientos
              </h2>
              <TablaMovimientos movimientos={turno.movimientos} />
            </Panel>
          </>
        )
      )}
    </Pagina>
  );
}
