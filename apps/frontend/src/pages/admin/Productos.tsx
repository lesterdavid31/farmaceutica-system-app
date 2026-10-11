import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useUsuario } from '@/auth/sesion';
import { BadgeEstado } from '@/components/BadgeEstado';
import {
  BarraFiltros,
  Campo,
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Paginacion,
  Panel,
  PanelError,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Checkbox, Input, Select } from '@/components/ui/input';
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
import type { Categoria, Producto } from '@/lib/dominio';
import { formatearMoneda } from '@/lib/formato';

const esquema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/, 'Use de 3 a 30 letras mayúsculas, números o guiones'),
  nombre: z.string().trim().min(1, 'Ingrese el nombre').max(150),
  principioActivo: z.string().trim().min(1, 'Ingrese el principio activo').max(150),
  presentacion: z.string().trim().min(1, 'Ingrese la presentación').max(120),
  categoriaId: z.string().min(1, 'Seleccione una categoría'),
  precioVenta: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Ingrese un monto con máximo 2 decimales, por ejemplo 25.50')
    .refine((v) => Number(v) > 0, 'El precio debe ser mayor que cero'),
  requiereReceta: z.boolean(),
  activo: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

function FormularioProducto({
  producto,
  categorias,
  onTerminar,
}: {
  producto: Producto | null;
  categorias: Categoria[];
  onTerminar: () => void;
}) {
  const creando = producto === null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      sku: producto?.sku ?? '',
      nombre: producto?.nombre ?? '',
      principioActivo: producto?.principioActivo ?? '',
      presentacion: producto?.presentacion ?? '',
      categoriaId: producto?.categoriaId ?? '',
      precioVenta: producto ? Number(producto.precioVenta).toFixed(2) : '',
      requiereReceta: producto?.requiereReceta ?? false,
      activo: producto?.activo ?? true,
    },
  });
  const guardar = useMutacion(
    (d: Datos) => {
      const cuerpo = { ...d, precioVenta: Number(d.precioVenta) };
      return creando
        ? api.post('/productos', cuerpo)
        : api.patch(`/productos/${producto.id}`, cuerpo);
    },
    { invalidar: [['productos']], exito: creando ? 'Producto creado' : 'Producto actualizado' },
  );
  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d, { onSuccess: onTerminar }))} noValidate>
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="sku" etiqueta="SKU" error={errors.sku?.message}>
          <Input id="sku" aria-invalid={!!errors.sku} {...register('sku')} />
        </Campo>
        <Campo id="categoriaId" etiqueta="Categoría" error={errors.categoriaId?.message}>
          <Select id="categoriaId" aria-invalid={!!errors.categoriaId} {...register('categoriaId')}>
            <option value="">Seleccione una categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="nombre"
          etiqueta="Nombre"
          error={errors.nombre?.message}
          className="sm:col-span-2"
        >
          <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
        </Campo>
        <Campo
          id="principioActivo"
          etiqueta="Principio activo"
          error={errors.principioActivo?.message}
          className="sm:col-span-2"
        >
          <Input
            id="principioActivo"
            aria-invalid={!!errors.principioActivo}
            {...register('principioActivo')}
          />
        </Campo>
        <Campo id="presentacion" etiqueta="Presentación" error={errors.presentacion?.message}>
          <Input
            id="presentacion"
            aria-invalid={!!errors.presentacion}
            {...register('presentacion')}
          />
        </Campo>
        <Campo id="precioVenta" etiqueta="Precio de venta (Q)" error={errors.precioVenta?.message}>
          <Input
            id="precioVenta"
            inputMode="decimal"
            className="text-right tabular-nums"
            aria-invalid={!!errors.precioVenta}
            {...register('precioVenta')}
          />
        </Campo>
        <label className="flex items-center gap-2 text-denso sm:col-span-2">
          <Checkbox {...register('requiereReceta')} />
          Requiere receta (solo muestra un aviso en el punto de venta)
        </label>
        {!creando && (
          <label className="flex items-center gap-2 text-denso sm:col-span-2">
            <Checkbox {...register('activo')} />
            Producto activo
          </label>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {creando ? 'Crear producto' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Productos() {
  const puedeEditar = useUsuario().rol === 'ADMIN';
  const listado = useListado<Producto, { q: string; categoriaId: string; activo: string }>(
    'productos',
    { q: '', categoriaId: '', activo: 'true' },
  );
  const categorias = useCatalogo<PaginaApi<Categoria>>(
    'categorias',
    '/categorias?limit=100&activa=true',
  );
  const [editando, setEditando] = useState<Producto | null | undefined>(undefined);
  const [desactivando, setDesactivando] = useState<Producto | null>(null);
  const desactivar = useMutacion((p: Producto) => api.delete(`/productos/${p.id}`), {
    invalidar: [['productos']],
    exito: 'Producto desactivado',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Productos"
        descripcion="Catálogo de medicamentos. El precio de venta es el mismo en todas las sucursales."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando(null)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear producto
            </Button>
          )
        }
      />
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
            aria-label="Filtrar por estado"
            className="w-full sm:w-40"
            value={listado.filtros.activo}
            onChange={(e) => listado.setFiltro('activo', e.target.value)}
          >
            <option value="true">Activos</option>
            <option value="false">Desactivados</option>
            <option value="">Todos</option>
          </Select>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="No hay productos con estos filtros."
            accion={
              puedeEditar && <Button onClick={() => setEditando(null)}>Crear producto</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead numerico>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums whitespace-nowrap">{p.sku}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="block text-meta text-texto-secundario">
                        {p.principioActivo} · {p.presentacion}
                      </span>
                    </TableCell>
                    <TableCell>{p.categoria.nombre}</TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(p.precioVenta)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex flex-wrap gap-1">
                        <BadgeEstado tono={p.activo ? 'correcto' : 'neutro'}>
                          {p.activo ? 'Activo' : 'Desactivado'}
                        </BadgeEstado>
                        {p.requiereReceta && <BadgeEstado tono="proceso">Con receta</BadgeEstado>}
                      </span>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="terciario" onClick={() => setEditando(p)}>
                          Editar
                        </Button>
                        {p.activo && (
                          <Button size="sm" variant="terciario" onClick={() => setDesactivando(p)}>
                            Desactivar
                          </Button>
                        )}
                      </TableCell>
                    )}
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

      <Dialog open={editando !== undefined} onOpenChange={(a) => !a && setEditando(undefined)}>
        {editando !== undefined && (
          <DialogContent titulo={editando ? 'Editar producto' : 'Crear producto'}>
            <FormularioProducto
              producto={editando}
              categorias={categorias.data?.data ?? []}
              onTerminar={() => setEditando(undefined)}
            />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        abierto={desactivando !== null}
        onAbiertoChange={(a) => !a && setDesactivando(null)}
        titulo="Desactivar producto"
        descripcion={`${desactivando?.nombre ?? ''} ya no podrá venderse ni trasladarse. Su historial y existencias se conservan.`}
        textoConfirmar="Desactivar producto"
        destructivo
        pendiente={desactivar.isPending}
        onConfirmar={() =>
          desactivando &&
          desactivar.mutate(desactivando, { onSettled: () => setDesactivando(null) })
        }
      />
    </Pagina>
  );
}
