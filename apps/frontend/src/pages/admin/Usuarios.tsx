import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { ROLES, ROLES_GLOBALES, type Rol, type Ubicacion, type Usuario } from '@/lib/dominio';

const ROLES_LISTA = Object.keys(ROLES) as Rol[];
const PASSWORD = /(?=.*[A-Za-z])(?=.*\d)/;
const MENSAJE_PASSWORD = 'Use al menos 8 caracteres, con letras y números';

function esquema(creando: boolean) {
  return z
    .object({
      nombre: z.string().trim().min(1, 'Ingrese el nombre').max(120),
      email: z.email('Ingrese un correo electrónico válido').trim().toLowerCase(),
      rol: z.enum(ROLES_LISTA as [Rol, ...Rol[]], { error: 'Seleccione un rol' }),
      ubicacionId: z.string(),
      password: creando
        ? z.string().min(8, MENSAJE_PASSWORD).regex(PASSWORD, MENSAJE_PASSWORD)
        : z.union([
            z.literal(''),
            z.string().min(8, MENSAJE_PASSWORD).regex(PASSWORD, MENSAJE_PASSWORD),
          ]),
      activo: z.boolean(),
    })
    .refine((d) => ROLES_GLOBALES.includes(d.rol) || d.ubicacionId !== '', {
      path: ['ubicacionId'],
      message: 'Los gerentes y cajeros deben tener una ubicación',
    });
}
type DatosUsuario = z.infer<ReturnType<typeof esquema>>;

function FormularioUsuario({
  usuario,
  ubicaciones,
  onTerminar,
}: {
  usuario: Usuario | null;
  ubicaciones: Ubicacion[];
  onTerminar: () => void;
}) {
  const creando = usuario === null;
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DatosUsuario>({
    resolver: zodResolver(esquema(creando)),
    defaultValues: {
      nombre: usuario?.nombre ?? '',
      email: usuario?.email ?? '',
      rol: usuario?.rol ?? 'CAJERO',
      ubicacionId: usuario?.ubicacionId ?? '',
      password: '',
      activo: usuario?.activo ?? true,
    },
  });
  const rol = useWatch({ control, name: 'rol' });
  const global = ROLES_GLOBALES.includes(rol);

  const guardar = useMutacion(
    (d: DatosUsuario) => {
      const cuerpo = {
        nombre: d.nombre,
        email: d.email,
        rol: d.rol,
        ubicacionId: global ? null : d.ubicacionId,
        ...(d.password && { password: d.password }),
        ...(!creando && { activo: d.activo }),
      };
      return creando
        ? api.post<Usuario>('/usuarios', cuerpo)
        : api.patch<Usuario>(`/usuarios/${usuario.id}`, cuerpo);
    },
    { invalidar: [['usuarios']], exito: creando ? 'Usuario creado' : 'Usuario actualizado' },
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
          etiqueta="Nombre completo"
          error={errors.nombre?.message}
          className="sm:col-span-2"
        >
          <Input id="nombre" aria-invalid={!!errors.nombre} {...register('nombre')} />
        </Campo>
        <Campo
          id="email"
          etiqueta="Correo electrónico"
          error={errors.email?.message}
          className="sm:col-span-2"
        >
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
        </Campo>
        <Campo id="rol" etiqueta="Rol" error={errors.rol?.message}>
          <Select id="rol" {...register('rol')}>
            {ROLES_LISTA.map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="ubicacionId"
          etiqueta="Ubicación"
          ayuda={global ? 'Este rol tiene acceso a todas las ubicaciones' : undefined}
          error={errors.ubicacionId?.message}
        >
          <Select
            id="ubicacionId"
            disabled={global}
            aria-invalid={!!errors.ubicacionId}
            {...register('ubicacionId')}
          >
            <option value="">{global ? 'Todas' : 'Seleccione una ubicación'}</option>
            {ubicaciones
              .filter((u) => u.activa && !(rol === 'CAJERO' && u.tipo === 'BODEGA_CENTRAL'))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo
          id="password"
          etiqueta={creando ? 'Contraseña' : 'Nueva contraseña'}
          ayuda={creando ? MENSAJE_PASSWORD : 'Déjela vacía para conservar la actual'}
          error={errors.password?.message}
          className="sm:col-span-2"
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Campo>
        {!creando && (
          <label className="flex items-center gap-2 text-denso sm:col-span-2">
            <Checkbox {...register('activo')} />
            Usuario activo
          </label>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {creando ? 'Crear usuario' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Usuarios() {
  const actor = useUsuario();
  const puedeEditar = actor.rol === 'ADMIN';
  const listado = useListado<
    Usuario,
    { q: string; rol: string; ubicacionId: string; activo: string }
  >('usuarios', { q: '', rol: '', ubicacionId: '', activo: 'true' });
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>('ubicaciones', '/ubicaciones?limit=100');
  const [editando, setEditando] = useState<Usuario | null | undefined>(undefined);
  const [desactivando, setDesactivando] = useState<Usuario | null>(null);

  const desactivar = useMutacion((u: Usuario) => api.delete(`/usuarios/${u.id}`), {
    invalidar: [['usuarios']],
    exito: 'Usuario desactivado',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Cuentas de acceso al sistema, con su rol y ubicación."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando(null)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear usuario
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar usuarios"
            className="w-full sm:w-72"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
          <Select
            aria-label="Filtrar por rol"
            className="w-full sm:w-56"
            value={listado.filtros.rol}
            onChange={(e) => listado.setFiltro('rol', e.target.value)}
          >
            <option value="">Todos los roles</option>
            {ROLES_LISTA.map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por ubicación"
            className="w-full sm:w-64"
            value={listado.filtros.ubicacionId}
            onChange={(e) => listado.setFiltro('ubicacionId', e.target.value)}
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.data?.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
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
            texto="No hay usuarios con estos filtros."
            accion={puedeEditar && <Button onClick={() => setEditando(null)}>Crear usuario</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.nombre}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{ROLES[u.rol]}</TableCell>
                    <TableCell>{u.ubicacion?.nombre ?? 'Todas'}</TableCell>
                    <TableCell>
                      <BadgeEstado tono={u.activo ? 'correcto' : 'neutro'}>
                        {u.activo ? 'Activo' : 'Desactivado'}
                      </BadgeEstado>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="terciario" onClick={() => setEditando(u)}>
                          Editar
                        </Button>
                        {u.activo && u.id !== actor.id && (
                          <Button size="sm" variant="terciario" onClick={() => setDesactivando(u)}>
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

      <Dialog
        open={editando !== undefined}
        onOpenChange={(abierto) => !abierto && setEditando(undefined)}
      >
        {editando !== undefined && (
          <DialogContent titulo={editando ? 'Editar usuario' : 'Crear usuario'}>
            <FormularioUsuario
              usuario={editando}
              ubicaciones={ubicaciones.data?.data ?? []}
              onTerminar={() => setEditando(undefined)}
            />
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        abierto={desactivando !== null}
        onAbiertoChange={(abierto) => !abierto && setDesactivando(null)}
        titulo="Desactivar usuario"
        descripcion={`${desactivando?.nombre ?? ''} ya no podrá iniciar sesión. Su historial se conserva y puede reactivarlo después.`}
        textoConfirmar="Desactivar usuario"
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
