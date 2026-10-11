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
import { api } from '@/lib/api';
import { useCatalogo, useListado, useMutacion } from '@/lib/consultas';
import {
  TIPOS_UBICACION,
  type Departamento,
  type TipoUbicacion,
  type Ubicacion,
} from '@/lib/dominio';

const TIPOS = Object.keys(TIPOS_UBICACION) as TipoUbicacion[];

const coordenada = (min: number, max: number, nombre: string) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, `Ingrese la ${nombre} en grados decimales, por ejemplo 14.84`)
    .refine(
      (v) => Number(v) >= min && Number(v) <= max,
      `La ${nombre} debe estar entre ${min} y ${max}`,
    );

const esquema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Use de 2 a 20 letras mayúsculas, números o guiones'),
  nombre: z.string().trim().min(1, 'Ingrese el nombre').max(120),
  tipo: z.enum(TIPOS as [TipoUbicacion, ...TipoUbicacion[]]),
  departamentoId: z.string().min(1, 'Seleccione un departamento'),
  municipioId: z.string().min(1, 'Seleccione un municipio'),
  direccion: z.string().trim().min(1, 'Ingrese la dirección').max(250),
  telefono: z.string().trim().max(20),
  latitud: coordenada(-90, 90, 'latitud'),
  longitud: coordenada(-180, 180, 'longitud'),
  activa: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

function FormularioUbicacion({
  ubicacion,
  departamentos,
  onTerminar,
}: {
  ubicacion: Ubicacion | null;
  departamentos: Departamento[];
  onTerminar: () => void;
}) {
  const creando = ubicacion === null;
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      codigo: ubicacion?.codigo ?? '',
      nombre: ubicacion?.nombre ?? '',
      tipo: ubicacion?.tipo ?? 'FARMACIA_CC',
      departamentoId: ubicacion?.municipio.departamento.id ?? '',
      municipioId: ubicacion?.municipioId ?? '',
      direccion: ubicacion?.direccion ?? '',
      telefono: ubicacion?.telefono ?? '',
      latitud: ubicacion ? String(Number(ubicacion.latitud)) : '',
      longitud: ubicacion ? String(Number(ubicacion.longitud)) : '',
      activa: ubicacion?.activa ?? true,
    },
  });
  const departamentoId = useWatch({ control, name: 'departamentoId' });
  const municipios = departamentos.find((d) => d.id === departamentoId)?.municipios ?? [];

  const guardar = useMutacion(
    ({ telefono, latitud, longitud, ...d }: Datos) => {
      // departamentoId solo filtra los municipios; la API recibe el municipio.
      const cuerpo = {
        codigo: d.codigo,
        nombre: d.nombre,
        tipo: d.tipo,
        municipioId: d.municipioId,
        direccion: d.direccion,
        activa: d.activa,
        latitud: Number(latitud),
        longitud: Number(longitud),
        ...(telefono && { telefono }),
      };
      return creando
        ? api.post('/ubicaciones', cuerpo)
        : api.patch(`/ubicaciones/${ubicacion.id}`, cuerpo);
    },
    { invalidar: [['ubicaciones']], exito: creando ? 'Ubicación creada' : 'Ubicación actualizada' },
  );

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d, { onSuccess: onTerminar }))} noValidate>
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="codigo" etiqueta="Código" error={errors.codigo?.message}>
          <Input id="codigo" aria-invalid={!!errors.codigo} {...register('codigo')} />
        </Campo>
        <Campo id="tipo" etiqueta="Tipo" error={errors.tipo?.message}>
          <Select id="tipo" {...register('tipo')}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPOS_UBICACION[t]}
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
        <Campo id="departamentoId" etiqueta="Departamento" error={errors.departamentoId?.message}>
          <Select
            id="departamentoId"
            aria-invalid={!!errors.departamentoId}
            {...register('departamentoId', { onChange: () => setValue('municipioId', '') })}
          >
            <option value="">Seleccione un departamento</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="municipioId"
          etiqueta="Municipio"
          error={errors.municipioId?.message}
          ayuda={
            departamentoId && municipios.length === 0
              ? 'Este departamento aún no tiene municipios cargados'
              : undefined
          }
        >
          <Select id="municipioId" aria-invalid={!!errors.municipioId} {...register('municipioId')}>
            <option value="">Seleccione un municipio</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="direccion"
          etiqueta="Dirección"
          error={errors.direccion?.message}
          className="sm:col-span-2"
        >
          <Input id="direccion" aria-invalid={!!errors.direccion} {...register('direccion')} />
        </Campo>
        <Campo
          id="latitud"
          etiqueta="Latitud"
          ayuda="Se usa para calcular tiempos de entrega"
          error={errors.latitud?.message}
        >
          <Input
            id="latitud"
            inputMode="decimal"
            aria-invalid={!!errors.latitud}
            {...register('latitud')}
          />
        </Campo>
        <Campo id="longitud" etiqueta="Longitud" error={errors.longitud?.message}>
          <Input
            id="longitud"
            inputMode="decimal"
            aria-invalid={!!errors.longitud}
            {...register('longitud')}
          />
        </Campo>
        <Campo id="telefono" etiqueta="Teléfono" error={errors.telefono?.message}>
          <Input id="telefono" type="tel" {...register('telefono')} />
        </Campo>
        {!creando && (
          <label className="flex items-center gap-2 self-end pb-2 text-denso">
            <Checkbox {...register('activa')} />
            Ubicación activa
          </label>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {creando ? 'Crear ubicación' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Ubicaciones() {
  const puedeEditar = useUsuario().rol === 'ADMIN';
  const listado = useListado<Ubicacion, { q: string; tipo: string; activa: string }>(
    'ubicaciones',
    { q: '', tipo: '', activa: 'true' },
  );
  const departamentos = useCatalogo<Departamento[]>('departamentos', '/departamentos');
  const [editando, setEditando] = useState<Ubicacion | null | undefined>(undefined);
  const [desactivando, setDesactivando] = useState<Ubicacion | null>(null);
  const desactivar = useMutacion((u: Ubicacion) => api.delete(`/ubicaciones/${u.id}`), {
    invalidar: [['ubicaciones']],
    exito: 'Ubicación desactivada',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Ubicaciones"
        descripcion="Bodega central, farmacias en centros comerciales y stands en gasolineras."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando(null)}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear ubicación
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre o código"
            aria-label="Buscar ubicaciones"
            className="w-full sm:w-72"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
          <Select
            aria-label="Filtrar por tipo"
            className="w-full sm:w-64"
            value={listado.filtros.tipo}
            onChange={(e) => listado.setFiltro('tipo', e.target.value)}
          >
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPOS_UBICACION[t]}
              </option>
            ))}
          </Select>
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
            texto="No hay ubicaciones con estos filtros."
            accion={
              puedeEditar && <Button onClick={() => setEditando(null)}>Crear ubicación</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-nowrap">{u.codigo}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{u.nombre}</span>
                      <span className="block text-meta text-texto-secundario">{u.direccion}</span>
                    </TableCell>
                    <TableCell>{TIPOS_UBICACION[u.tipo]}</TableCell>
                    <TableCell>
                      {u.municipio.nombre}, {u.municipio.departamento.nombre}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{u.telefono}</TableCell>
                    <TableCell>
                      <BadgeEstado tono={u.activa ? 'correcto' : 'neutro'}>
                        {u.activa ? 'Activa' : 'Desactivada'}
                      </BadgeEstado>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="terciario" onClick={() => setEditando(u)}>
                          Editar
                        </Button>
                        {u.activa && (
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

      <Dialog open={editando !== undefined} onOpenChange={(a) => !a && setEditando(undefined)}>
        {editando !== undefined && (
          <DialogContent
            titulo={editando ? 'Editar ubicación' : 'Crear ubicación'}
            className="max-w-2xl"
          >
            <FormularioUbicacion
              ubicacion={editando}
              departamentos={departamentos.data ?? []}
              onTerminar={() => setEditando(undefined)}
            />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        abierto={desactivando !== null}
        onAbiertoChange={(a) => !a && setDesactivando(null)}
        titulo="Desactivar ubicación"
        descripcion={`${desactivando?.nombre ?? ''} dejará de aparecer para operar. Su inventario, caja e historial se conservan.`}
        textoConfirmar="Desactivar ubicación"
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
