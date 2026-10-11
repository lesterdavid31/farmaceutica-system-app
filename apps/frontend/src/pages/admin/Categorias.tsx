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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
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
import type { Categoria } from '@/lib/dominio';

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Ingrese el nombre').max(80),
  descripcion: z.string().trim().max(250),
  activa: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

function FormularioCategoria({
  categoria,
  onTerminar,
}: {
  categoria: Categoria | null;
  onTerminar: () => void;
}) {
  const creando = categoria === null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombre: categoria?.nombre ?? '',
      descripcion: categoria?.descripcion ?? '',
      activa: categoria?.activa ?? true,
    },
  });
  const guardar = useMutacion(
    (d: Datos) =>
      creando ? api.post('/categorias', d) : api.patch(`/categorias/${categoria.id}`, d),
    { invalidar: [['categorias']], exito: creando ? 'Categoría creada' : 'Categoría actualizada' },
  );
  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d, { onSuccess: onTerminar }))} noValidate>
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Campo id="nombre" etiqueta="Nombre" error={errors.nombre?.message}>
          <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
        </Campo>
        <Campo id="descripcion" etiqueta="Descripción" error={errors.descripcion?.message}>
          <Textarea id="descripcion" {...register('descripcion')} />
        </Campo>
        {!creando && (
          <label className="flex items-center gap-2 text-denso">
            <Checkbox {...register('activa')} />
            Categoría activa
          </label>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {creando ? 'Crear categoría' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Categorias() {
  const puedeEditar = useUsuario().rol === 'ADMIN';
  const listado = useListado<Categoria, { q: string; activa: string }>('categorias', {
    q: '',
    activa: 'true',
  });
  const [editando, setEditando] = useState<Categoria | null | undefined>(undefined);
  const [desactivando, setDesactivando] = useState<Categoria | null>(null);
  const desactivar = useMutacion((c: Categoria) => api.delete(`/categorias/${c.id}`), {
    invalidar: [['categorias']],
    exito: 'Categoría desactivada',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Categorías"
        descripcion="Clasificación de los productos del catálogo."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando(null)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear categoría
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre"
            aria-label="Buscar categorías"
            className="w-full sm:w-72"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
          <Select
            aria-label="Filtrar por estado"
            className="w-full sm:w-40"
            value={listado.filtros.activa}
            onChange={(e) => listado.setFiltro('activa', e.target.value)}
          >
            <option value="true">Activas</option>
            <option value="false">Desactivadas</option>
            <option value="">Todas</option>
          </Select>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="No hay categorías con estos filtros."
            accion={
              puedeEditar && <Button onClick={() => setEditando(null)}>Crear categoría</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead numerico>Productos</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.nombre}</TableCell>
                    <TableCell className="text-texto-secundario">{c.descripcion}</TableCell>
                    <TableCell numerico>{c._count?.productos ?? 0}</TableCell>
                    <TableCell>
                      <BadgeEstado tono={c.activa ? 'correcto' : 'neutro'}>
                        {c.activa ? 'Activa' : 'Desactivada'}
                      </BadgeEstado>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="terciario" onClick={() => setEditando(c)}>
                          Editar
                        </Button>
                        {c.activa && (
                          <Button size="sm" variant="terciario" onClick={() => setDesactivando(c)}>
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
          <DialogContent titulo={editando ? 'Editar categoría' : 'Crear categoría'}>
            <FormularioCategoria categoria={editando} onTerminar={() => setEditando(undefined)} />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        abierto={desactivando !== null}
        onAbiertoChange={(a) => !a && setDesactivando(null)}
        titulo="Desactivar categoría"
        descripcion={`La categoría ${desactivando?.nombre ?? ''} ya no aparecerá al crear productos. Sus productos se conservan.`}
        textoConfirmar="Desactivar categoría"
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
