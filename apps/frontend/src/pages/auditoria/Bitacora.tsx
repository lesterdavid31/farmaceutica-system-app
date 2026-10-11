import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
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
import type { Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useListado } from '@/lib/consultas';
import { etiquetaAccion, ROLES, type RegistroBitacora, type Usuario } from '@/lib/dominio';
import { formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

function tonoAccion(accion: string): TonoEstado {
  if (accion === 'LOGIN_FALLIDO' || accion === 'ELIMINAR' || accion.startsWith('ANULA')) {
    return 'peligro';
  }
  if (accion === 'DESACTIVAR') {
    return 'advertencia';
  }
  if (accion === 'LOGIN') {
    return 'neutro';
  }
  return 'proceso';
}

function texto(valor: unknown) {
  if (valor === undefined) {
    return '';
  }
  if (valor === null) {
    return 'vacío';
  }
  if (typeof valor === 'boolean') {
    return valor ? 'sí' : 'no';
  }
  if (typeof valor === 'object') {
    return JSON.stringify(valor);
  }
  return String(valor);
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** Comparación campo por campo de los datos antes y después del cambio. */
function DetalleCambios({ registro }: { registro: RegistroBitacora }) {
  const antes = comoObjeto(registro.datosAntes);
  const despues = comoObjeto(registro.datosDespues);
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
    (c) => !['createdAt', 'updatedAt'].includes(c),
  );
  if (claves.length === 0) {
    return (
      <p className="m-0 text-denso text-texto-secundario">
        Esta acción no guarda datos adicionales.
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-denso">
      <thead>
        <tr className="text-left text-texto-secundario">
          <th className="w-48 py-1 pr-4 font-semibold">Campo</th>
          <th className="py-1 pr-4 font-semibold">Antes</th>
          <th className="py-1 font-semibold">Después</th>
        </tr>
      </thead>
      <tbody>
        {claves.map((clave) => {
          const a = texto(antes[clave]);
          const d = texto(despues[clave]);
          const cambio = clave in antes && clave in despues && a !== d;
          return (
            <tr key={clave} className={cn('align-top', cambio && 'bg-ambar-fondo')}>
              <td className="py-1 pr-4 font-semibold">{clave}</td>
              <td className="py-1 pr-4 break-all text-texto-secundario">{a}</td>
              <td className={cn('py-1 break-all', cambio && 'font-semibold text-ambar')}>{d}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Bitacora() {
  const listado = useListado<
    RegistroBitacora,
    { usuarioId: string; entidad: string; accion: string; desde: string; hasta: string }
  >('bitacora', { usuarioId: '', entidad: '', accion: '', desde: '', hasta: '' }, { limit: 25 });
  const catalogos = useCatalogo<{ entidades: string[]; acciones: string[] }>(
    'bitacora',
    '/bitacora/catalogos',
  );
  const usuarios = useCatalogo<PaginaApi<Usuario>>('usuarios', '/usuarios?limit=100');
  const [abierto, setAbierto] = useState<string | null>(null);

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Bitácora"
        descripcion="Registro inmutable de las acciones que crean, modifican o anulan datos."
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-64">
            <Label htmlFor="f-usuario">Usuario</Label>
            <Select
              id="f-usuario"
              value={listado.filtros.usuarioId}
              onChange={(e) => listado.setFiltro('usuarioId', e.target.value)}
            >
              <option value="">Todos los usuarios</option>
              {usuarios.data?.data.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <Label htmlFor="f-entidad">Entidad</Label>
            <Select
              id="f-entidad"
              value={listado.filtros.entidad}
              onChange={(e) => listado.setFiltro('entidad', e.target.value)}
            >
              <option value="">Todas</option>
              {catalogos.data?.entidades.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-52">
            <Label htmlFor="f-accion">Acción</Label>
            <Select
              id="f-accion"
              value={listado.filtros.accion}
              onChange={(e) => listado.setFiltro('accion', e.target.value)}
            >
              <option value="">Todas</option>
              {catalogos.data?.acciones.map((a) => (
                <option key={a} value={a}>
                  {etiquetaAccion(a)}
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
          <EstadoVacio texto="No hay registros con estos filtros. Amplíe el rango de fechas o quite filtros." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Detalle</span>
                  </TableHead>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((r) => {
                  const expandido = abierto === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow className={cn(expandido && 'bg-salvia')}>
                        <TableCell>
                          <Button
                            size="icono"
                            variant="terciario"
                            className="size-8"
                            aria-expanded={expandido}
                            aria-label={expandido ? 'Ocultar cambios' : 'Ver cambios'}
                            onClick={() => setAbierto(expandido ? null : r.id)}
                          >
                            {expandido ? (
                              <ChevronDown size={16} strokeWidth={1.75} />
                            ) : (
                              <ChevronRight size={16} strokeWidth={1.75} />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {formatearFechaHora(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          {r.usuario ? (
                            <>
                              {r.usuario.nombre}
                              <span className="block text-meta text-texto-secundario">
                                {ROLES[r.usuario.rol]}
                              </span>
                            </>
                          ) : (
                            <span className="text-texto-secundario">Desconocido</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <BadgeEstado tono={tonoAccion(r.accion)}>
                            {etiquetaAccion(r.accion)}
                          </BadgeEstado>
                        </TableCell>
                        <TableCell>
                          {r.entidad}
                          {r.entidadId && (
                            <span className="block text-meta text-texto-secundario">
                              {r.entidadId.slice(0, 8)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums text-texto-secundario">{r.ip}</TableCell>
                      </TableRow>
                      {expandido && (
                        <tr className="border-b border-borde bg-fondo">
                          <td colSpan={6} className="px-4 py-3 sm:pl-14">
                            <DetalleCambios registro={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
