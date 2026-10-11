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
import { api } from '@/lib/api';
import { useListado, useMutacion } from '@/lib/consultas';
import type { Proveedor } from '@/lib/dominio';

const opcional = (max: number) => z.string().trim().max(max);

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Ingrese el nombre').max(150),
  nit: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{1,12}-?[0-9K]$/, 'Ingrese un NIT válido, por ejemplo 1234567-8'),
  telefono: opcional(20),
  email: z.union([z.literal(''), z.email('Ingrese un correo electrónico válido')]),
  contacto: opcional(120),
  direccion: opcional(250),
  activo: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

/** Los campos opcionales vacíos no se envían, para no guardar textos vacíos. */
function limpiar(d: Datos) {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
}

function FormularioProveedor({
  proveedor,
  onTerminar,
}: {
  proveedor: Proveedor | null;
  onTerminar: () => void;
}) {
  const creando = proveedor === null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombre: proveedor?.nombre ?? '',
      nit: proveedor?.nit ?? '',
      telefono: proveedor?.telefono ?? '',
      email: proveedor?.email ?? '',
      contacto: proveedor?.contacto ?? '',
      direccion: proveedor?.direccion ?? '',
      activo: proveedor?.activo ?? true,
    },
  });
  const guardar = useMutacion(
    (d: Datos) =>
      creando
        ? api.post('/proveedores', limpiar(d))
        : api.patch(`/proveedores/${proveedor.id}`, limpiar(d)),
    { invalidar: [['proveedores']], exito: creando ? 'Proveedor creado' : 'Proveedor actualizado' },
  );
  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d, { onSuccess: onTerminar }))} noValidate>
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="nombre"
          etiqueta="Razón social"
          error={errors.nombre?.message}
          className="sm:col-span-2"
        >
          <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
        </Campo>
        <Campo id="nit" etiqueta="NIT" error={errors.nit?.message}>
          <Input id="nit" aria-invalid={!!errors.nit} {...register('nit')} />
        </Campo>
        <Campo id="telefono" etiqueta="Teléfono" error={errors.telefono?.message}>
          <Input id="telefono" type="tel" {...register('telefono')} />
        </Campo>
        <Campo id="email" etiqueta="Correo electrónico" error={errors.email?.message}>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
        </Campo>
        <Campo id="contacto" etiqueta="Persona de contacto" error={errors.contacto?.message}>
          <Input id="contacto" {...register('contacto')} />
        </Campo>
        <Campo
          id="direccion"
          etiqueta="Dirección"
          error={errors.direccion?.message}
          className="sm:col-span-2"
        >
          <Input id="direccion" {...register('direccion')} />
        </Campo>
        {!creando && (
          <label className="flex items-center gap-2 text-denso sm:col-span-2">
            <Checkbox {...register('activo')} />
            Proveedor activo
          </label>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {creando ? 'Crear proveedor' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Proveedores() {
  const puedeEditar = useUsuario().rol === 'ADMIN';
  const listado = useListado<Proveedor, { q: string; activo: string }>('proveedores', {
    q: '',
    activo: 'true',
  });
  const [editando, setEditando] = useState<Proveedor | null | undefined>(undefined);
  const [desactivando, setDesactivando] = useState<Proveedor | null>(null);
  const desactivar = useMutacion((p: Proveedor) => api.delete(`/proveedores/${p.id}`), {
    invalidar: [['proveedores']],
    exito: 'Proveedor desactivado',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Empresas a las que la bodega central compra medicamentos."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando(null)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear proveedor
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre o NIT"
            aria-label="Buscar proveedores"
            className="w-full sm:w-72"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
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
            texto="No hay proveedores con estos filtros."
            accion={
              puedeEditar && <Button onClick={() => setEditando(null)}>Crear proveedor</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razón social</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.nombre}</TableCell>
                    <TableCell className="tabular-nums">{p.nit}</TableCell>
                    <TableCell>
                      {p.contacto}
                      {p.email && (
                        <span className="block text-meta text-texto-secundario">{p.email}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.telefono}</TableCell>
                    <TableCell>
                      <BadgeEstado tono={p.activo ? 'correcto' : 'neutro'}>
                        {p.activo ? 'Activo' : 'Desactivado'}
                      </BadgeEstado>
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
          <DialogContent titulo={editando ? 'Editar proveedor' : 'Crear proveedor'}>
            <FormularioProveedor proveedor={editando} onTerminar={() => setEditando(undefined)} />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        abierto={desactivando !== null}
        onAbiertoChange={(a) => !a && setDesactivando(null)}
        titulo="Desactivar proveedor"
        descripcion={`${desactivando?.nombre ?? ''} ya no aparecerá al registrar compras. Su historial se conserva.`}
        textoConfirmar="Desactivar proveedor"
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
