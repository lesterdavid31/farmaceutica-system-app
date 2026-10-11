import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import { BadgeEstado, type TonoEstado } from '@/components/BadgeEstado';
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
import { SelectorProducto, type ProductoElegido } from '@/components/SelectorProducto';
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
import {
  TIPOS_MOVIMIENTO,
  type MovimientoKardex,
  type Producto,
  type TipoMovimientoInventario,
  type Ubicacion,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { vigenciaLocal } from '@/lib/vigencia';
import { cn } from '@/lib/utils';

const TONO_MOVIMIENTO: Record<TipoMovimientoInventario, TonoEstado> = {
  COMPRA: 'correcto',
  TRASLADO_ENTRADA: 'correcto',
  VENTA: 'neutro',
  TRASLADO_SALIDA: 'proceso',
  AJUSTE: 'advertencia',
  ANULACION_VENTA: 'advertencia',
  BAJA_VENCIMIENTO: 'peligro',
};

function TablaKardex({ productoId, ubicacionId }: { productoId: string; ubicacionId: string }) {
  const listado = useListado<MovimientoKardex, { tipo: string; desde: string; hasta: string }>(
    'inventario/kardex',
    { tipo: '', desde: '', hasta: '' },
    { limit: 30, extra: { productoId, ubicacionId } },
  );
  return (
    <>
      <BarraFiltros>
        <div className="flex w-full flex-col gap-1 sm:w-56">
          <Label htmlFor="f-tipo">Tipo de movimiento</Label>
          <Select
            id="f-tipo"
            value={listado.filtros.tipo}
            onChange={(e) => listado.setFiltro('tipo', e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(TIPOS_MOVIMIENTO).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
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
        <EstadoVacio texto="No hay movimientos con estos filtros." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Lote</TableHead>
                {!ubicacionId && <TableHead>Ubicación</TableHead>}
                <TableHead numerico>Entrada</TableHead>
                <TableHead numerico>Salida</TableHead>
                <TableHead numerico>Saldo</TableHead>
                <TableHead numerico>Costo unitario</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listado.data.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatearFechaHora(m.fecha)}
                  </TableCell>
                  <TableCell>
                    <BadgeEstado tono={TONO_MOVIMIENTO[m.tipo]}>
                      {TIPOS_MOVIMIENTO[m.tipo]}
                    </BadgeEstado>
                  </TableCell>
                  <TableCell>
                    <EtiquetaLote
                      numeroLote={m.lote.numeroLote}
                      fechaVencimiento={m.lote.fechaVencimiento}
                      {...vigenciaLocal(m.lote.fechaVencimiento)}
                    />
                  </TableCell>
                  {!ubicacionId && <TableCell>{m.ubicacion.nombre}</TableCell>}
                  <TableCell numerico className="text-verde-botica">
                    {m.cantidad > 0 ? `+${m.cantidad}` : ''}
                  </TableCell>
                  <TableCell numerico>{m.cantidad < 0 ? m.cantidad : ''}</TableCell>
                  <TableCell numerico className="font-semibold">
                    {m.saldo}
                  </TableCell>
                  <TableCell numerico className="whitespace-nowrap">
                    {formatearMoneda(m.costoUnitario)}
                  </TableCell>
                  <TableCell className="min-w-48">
                    {m.motivo && <span className="block">{m.motivo}</span>}
                    <span className={cn('block text-meta text-texto-secundario')}>{m.usuario}</span>
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
    </>
  );
}

export function Kardex() {
  const usuario = useUsuario();
  const global = esGlobal(usuario);
  const { ubicacionId: ubicacionFiltro } = useFiltroUbicacion();
  const [parametros, setParametros] = useSearchParams();
  const productoId = parametros.get('productoId') ?? '';
  const ubicacionId = global
    ? (parametros.get('ubicacionId') ?? ubicacionFiltro)
    : (usuario.ubicacion?.id ?? '');

  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>('ubicaciones', '/ubicaciones?limit=100');
  const producto = useQuery({
    queryKey: ['productos', 'detalle', productoId],
    queryFn: () => api.get<Producto>(`/productos/${productoId}`),
    enabled: productoId !== '',
  });
  const [elegido, setElegido] = useState<ProductoElegido | null>(null);
  const actual =
    elegido ?? (producto.data && productoId === producto.data.id ? producto.data : null);

  const cambiar = (clave: string, valor: string) =>
    setParametros(
      (p) => {
        const nuevos = new URLSearchParams(p);
        if (valor) {
          nuevos.set(clave, valor);
        } else {
          nuevos.delete(clave);
        }
        return nuevos;
      },
      { replace: true },
    );

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Kardex"
        descripcion="Movimientos de inventario de un producto con el saldo después de cada uno."
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
          <div className="flex w-full flex-col gap-1 sm:w-96">
            <Label htmlFor="producto">Producto</Label>
            <SelectorProducto
              id="producto"
              valor={actual}
              onCambio={(p) => {
                setElegido(p);
                cambiar('productoId', p?.id ?? '');
              }}
            />
          </div>
          {global ? (
            <div className="flex w-full flex-col gap-1 sm:w-64">
              <Label htmlFor="ubicacion">Ubicación</Label>
              <Select
                id="ubicacion"
                value={ubicacionId}
                onChange={(e) => cambiar('ubicacionId', e.target.value)}
              >
                <option value="">Todas las ubicaciones</option>
                {ubicaciones.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="m-0 pb-2 text-denso text-texto-secundario">{usuario.ubicacion?.nombre}</p>
          )}
        </div>
        {productoId ? (
          <TablaKardex productoId={productoId} ubicacionId={ubicacionId} />
        ) : (
          <EstadoVacio texto="Busque un producto para ver su kardex." />
        )}
      </Panel>
    </Pagina>
  );
}
