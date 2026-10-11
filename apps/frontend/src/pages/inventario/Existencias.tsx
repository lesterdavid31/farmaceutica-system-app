import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { tieneRol, useUsuario } from '@/auth/sesion';
import { BadgeEstado } from '@/components/BadgeEstado';
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
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useListado, useMutacion } from '@/lib/consultas';
import type {
  Categoria,
  ExistenciaProducto,
  LoteExistencia,
  RespuestaExistencias,
} from '@/lib/dominio';
import { formatearFecha, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { DialogoAjuste, DialogoStockGlobal, DialogoStockMinimo } from './dialogos';

const VISTAS = {
  conExistencia: { etiqueta: 'Con existencia', filtros: { conExistencia: true } },
  bajoMinimo: { etiqueta: 'Bajo stock mínimo', filtros: { bajoMinimo: true } },
  todos: { etiqueta: 'Todos los productos', filtros: {} },
} as const;
type Vista = keyof typeof VISTAS;

function Cantidad({ valor, tono }: { valor: number; tono?: 'ambar' | 'ladrillo' }) {
  return (
    <span
      className={cn(
        valor === 0 && 'text-texto-secundario',
        valor > 0 && tono === 'ambar' && 'font-semibold text-ambar',
        valor > 0 && tono === 'ladrillo' && 'font-semibold text-ladrillo',
      )}
    >
      {valor}
    </span>
  );
}

export function Existencias() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const puedeGestionar = tieneRol(usuario, ['ADMIN', 'GERENTE']);
  const verKardex = tieneRol(usuario, ['ADMIN', 'AUDITOR', 'GERENTE']);
  const [vista, setVista] = useState<Vista>('conExistencia');
  const listado = useListado<
    ExistenciaProducto,
    { q: string; categoriaId: string },
    RespuestaExistencias
  >(
    'inventario/existencias',
    { q: '', categoriaId: '' },
    {
      extra: { ubicacionId, ...VISTAS[vista].filtros },
    },
  );
  const categorias = useCatalogo<PaginaApi<Categoria>>(
    'categorias',
    '/categorias?limit=100&activa=true',
  );
  const ubicaciones = useCatalogo<PaginaApi<{ id: string; nombre: string }>>(
    'ubicaciones',
    '/ubicaciones?limit=100',
  );

  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [ajuste, setAjuste] = useState<{ lote: LoteExistencia; producto: string } | null>(null);
  const [minimo, setMinimo] = useState<{
    ubicacionId: string;
    producto: { id: string; nombre: string };
    actual: number | null;
  } | null>(null);
  const [global, setGlobal] = useState<{ id: string; nombre: string } | null>(null);
  const [baja, setBaja] = useState<{ lote: LoteExistencia; producto: string } | null>(null);

  const darDeBaja = useMutacion(
    (l: LoteExistencia) =>
      api.post('/inventario/bajas', { ubicacionId: l.ubicacionId, loteId: l.loteId }),
    { invalidar: [['inventario']], exito: 'Lote dado de baja', errorEnToast: true },
  );

  const ubicacionVista = listado.data?.ubicacionId ?? (ubicacionId || null);
  const nombreUbicacion =
    usuario.ubicacion?.nombre ??
    ubicaciones.data?.data.find((u) => u.id === ubicacionVista)?.nombre;
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const nuevo = new Set(a);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Existencias"
        descripcion={
          ubicacionVista
            ? `${nombreUbicacion ?? 'Ubicación'} · existencia por lote y vencimiento`
            : 'Total de todas las ubicaciones · existencia por lote y vencimiento'
        }
      />

      {!ubicacionVista && (
        <p className="m-0 mb-4 flex items-start gap-2 rounded-control bg-acero-fondo px-4 py-3 text-denso text-acero">
          <Info size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          {usuario.rol === 'OPERADOR_CALL_CENTER'
            ? 'Está viendo el total de todas las ubicaciones. Use “Ver en todas las ubicaciones” para saber en qué sucursal hay stock.'
            : 'Está viendo el total de todas las ubicaciones. Elija una ubicación en la barra superior para ver una sucursal y registrar ajustes o bajas.'}
        </p>
      )}

      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre, SKU o principio activo"
            aria-label="Buscar productos"
            className="w-full sm:w-80"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
          <Select
            aria-label="Filtrar por categoría"
            className="w-full sm:w-64"
            value={listado.filtros.categoriaId}
            onChange={(e) => listado.setFiltro('categoriaId', e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categorias.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Mostrar"
            className="w-full sm:w-56"
            value={vista}
            onChange={(e) => {
              setVista(e.target.value as Vista);
              listado.setPage(1);
            }}
          >
            {Object.entries(VISTAS).map(([clave, v]) => (
              <option key={clave} value={clave}>
                {v.etiqueta}
              </option>
            ))}
          </Select>
        </BarraFiltros>

        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto={
              vista === 'bajoMinimo'
                ? 'Ningún producto está por debajo de su stock mínimo.'
                : 'No hay productos con existencia para estos filtros.'
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Lotes</span>
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead numerico>Vigente</TableHead>
                  <TableHead numerico>Por vencer</TableHead>
                  <TableHead numerico>Vencido</TableHead>
                  {ubicacionVista && <TableHead numerico>Mínimo</TableHead>}
                  <TableHead numerico>Valor a costo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((fila) => {
                  const abierto = abiertos.has(fila.producto.id);
                  return (
                    <Fragment key={fila.producto.id}>
                      <TableRow className={cn(abierto && 'bg-salvia')}>
                        <TableCell>
                          <Button
                            size="icono"
                            variant="terciario"
                            className="size-8"
                            aria-expanded={abierto}
                            aria-label={abierto ? 'Ocultar lotes' : 'Ver lotes'}
                            onClick={() => alternar(fila.producto.id)}
                          >
                            {abierto ? (
                              <ChevronDown size={16} strokeWidth={1.75} />
                            ) : (
                              <ChevronRight size={16} strokeWidth={1.75} />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{fila.producto.nombre}</span>
                          <span className="block text-meta text-texto-secundario">
                            {fila.producto.sku} · {fila.producto.presentacion}
                          </span>
                          {fila.bajoMinimo && (
                            <span className="mt-1 inline-block">
                              <BadgeEstado tono="advertencia">Bajo stock mínimo</BadgeEstado>
                            </span>
                          )}
                        </TableCell>
                        <TableCell numerico className="font-semibold">
                          {fila.vigente}
                        </TableCell>
                        <TableCell numerico>
                          <Cantidad valor={fila.porVencer} tono="ambar" />
                        </TableCell>
                        <TableCell numerico>
                          <Cantidad valor={fila.vencido} tono="ladrillo" />
                        </TableCell>
                        {ubicacionVista && (
                          <TableCell numerico className="text-texto-secundario">
                            {fila.cantidadMinima ?? ''}
                          </TableCell>
                        )}
                        <TableCell numerico className="whitespace-nowrap">
                          {formatearMoneda(fila.valorCosto)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="terciario"
                            onClick={() =>
                              setGlobal({ id: fila.producto.id, nombre: fila.producto.nombre })
                            }
                          >
                            Ver en todas las ubicaciones
                          </Button>
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <tr className="border-b border-borde bg-fondo">
                          <td colSpan={ubicacionVista ? 8 : 7} className="px-4 py-3 sm:pl-14">
                            {fila.lotes.length === 0 ? (
                              <p className="m-0 text-denso text-texto-secundario">
                                Sin existencia en lotes.
                              </p>
                            ) : (
                              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                {fila.lotes.map((l) => (
                                  <li
                                    key={`${l.ubicacionId}-${l.loteId}`}
                                    className="flex flex-wrap items-center gap-x-6 gap-y-2"
                                  >
                                    <EtiquetaLote
                                      numeroLote={l.numeroLote}
                                      fechaVencimiento={l.fechaVencimiento}
                                      vigencia={l.vigencia}
                                      diasParaVencer={l.diasParaVencer}
                                    />
                                    {!ubicacionVista && (
                                      <span className="w-56 text-denso">{l.ubicacion}</span>
                                    )}
                                    <span className="w-28 text-denso tabular-nums">
                                      {l.cantidad} unidades
                                    </span>
                                    <span className="w-36 text-denso text-texto-secundario tabular-nums">
                                      Costo {formatearMoneda(l.costoUnitario)}
                                    </span>
                                    {puedeGestionar && ubicacionVista && (
                                      <span className="flex gap-1">
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            setAjuste({ lote: l, producto: fila.producto.nombre })
                                          }
                                        >
                                          Registrar ajuste
                                        </Button>
                                        {l.vigencia === 'VENCIDO' && (
                                          <Button
                                            size="sm"
                                            variant="destructivo"
                                            onClick={() =>
                                              setBaja({ lote: l, producto: fila.producto.nombre })
                                            }
                                          >
                                            Dar de baja
                                          </Button>
                                        )}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {puedeGestionar && ubicacionVista && (
                                <Button
                                  size="sm"
                                  variant="terciario"
                                  onClick={() =>
                                    setMinimo({
                                      ubicacionId: ubicacionVista,
                                      producto: {
                                        id: fila.producto.id,
                                        nombre: fila.producto.nombre,
                                      },
                                      actual: fila.cantidadMinima,
                                    })
                                  }
                                >
                                  {fila.cantidadMinima === null
                                    ? 'Definir stock mínimo'
                                    : 'Cambiar stock mínimo'}
                                </Button>
                              )}
                              {verKardex && (
                                <Button size="sm" variant="terciario" asChild>
                                  <Link
                                    to={`/inventario/kardex?productoId=${fila.producto.id}${ubicacionVista ? `&ubicacionId=${ubicacionVista}` : ''}`}
                                  >
                                    Ver kardex
                                  </Link>
                                </Button>
                              )}
                            </div>
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

      <DialogoAjuste objetivo={ajuste} onCerrar={() => setAjuste(null)} />
      <DialogoStockMinimo objetivo={minimo} onCerrar={() => setMinimo(null)} />
      <DialogoStockGlobal producto={global} onCerrar={() => setGlobal(null)} />
      <ConfirmDialog
        abierto={baja !== null}
        onAbiertoChange={(a) => !a && setBaja(null)}
        titulo="Dar de baja lote vencido"
        descripcion={
          baja &&
          `Se retirarán ${baja.lote.cantidad} unidades del lote ${baja.lote.numeroLote} de ${baja.producto}, vencido el ${formatearFecha(baja.lote.fechaVencimiento)}. Quedará registrado en el kardex y no se puede deshacer.`
        }
        textoConfirmar="Dar de baja lote"
        destructivo
        pendiente={darDeBaja.isPending}
        onConfirmar={() => baja && darDeBaja.mutate(baja.lote, { onSettled: () => setBaja(null) })}
      />
    </Pagina>
  );
}
