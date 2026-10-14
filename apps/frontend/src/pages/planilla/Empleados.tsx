import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, tieneRol, useUsuario } from '@/auth/sesion';
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
import { useCatalogo, useListado, useMutacion } from '@/lib/consultas';
import { PUESTOS, type Empleado, type Puesto, type Ubicacion } from '@/lib/dominio';
import { formatearFecha, formatearMoneda } from '@/lib/formato';

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function FormularioEmpleado({
  empleado,
  onTerminar,
}: {
  empleado?: Empleado;
  onTerminar: () => void;
}) {
  const usuario = useUsuario();
  const admin = usuario.rol === 'ADMIN';
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const [valores, setValores] = useState({
    nombres: empleado?.nombres ?? '',
    apellidos: empleado?.apellidos ?? '',
    dpi: empleado?.dpi ?? '',
    puesto: (empleado?.puesto ?? 'CAJERO') as Puesto,
    salarioBase: empleado?.salarioBase ?? '',
    ubicacionId: empleado?.ubicacionId ?? usuario.ubicacion?.id ?? '',
    fechaIngreso: empleado?.fechaIngreso.slice(0, 10) ?? hoyLocal(),
  });
  const [enviado, setEnviado] = useState(false);
  const cambiar = (clave: keyof typeof valores, valor: string) =>
    setValores((v) => ({ ...v, [clave]: valor }));
  const errores = {
    nombres: valores.nombres.trim().length < 2 ? 'Ingrese los nombres' : undefined,
    apellidos: valores.apellidos.trim().length < 2 ? 'Ingrese los apellidos' : undefined,
    dpi: /^\d{13}$/.test(valores.dpi.replace(/\s/g, '')) ? undefined : 'El DPI tiene 13 dígitos',
    salarioBase:
      /^\d+(\.\d{1,2})?$/.test(valores.salarioBase) && Number(valores.salarioBase) > 0
        ? undefined
        : 'Monto mayor que cero, con máximo 2 decimales',
    ubicacionId: valores.ubicacionId ? undefined : 'Seleccione la ubicación',
    fechaIngreso:
      valores.fechaIngreso && valores.fechaIngreso <= hoyLocal()
        ? undefined
        : 'La fecha no puede ser futura',
  };
  const guardar = useMutacion(
    () => {
      const cuerpo = {
        nombres: valores.nombres.trim(),
        apellidos: valores.apellidos.trim(),
        dpi: valores.dpi.replace(/\s/g, ''),
        puesto: valores.puesto,
        salarioBase: Number(valores.salarioBase),
        fechaIngreso: valores.fechaIngreso,
        ...(admin || !empleado ? { ubicacionId: valores.ubicacionId } : {}),
      };
      return empleado
        ? api.patch(`/empleados/${empleado.id}`, cuerpo)
        : api.post('/empleados', cuerpo);
    },
    {
      invalidar: [['empleados']],
      exito: empleado ? 'Empleado actualizado' : 'Empleado registrado',
    },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!Object.values(errores).some(Boolean)) {
          guardar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nombres" etiqueta="Nombres" error={enviado ? errores.nombres : undefined}>
          <Input
            id="nombres"
            value={valores.nombres}
            onChange={(e) => cambiar('nombres', e.target.value)}
          />
        </Campo>
        <Campo id="apellidos" etiqueta="Apellidos" error={enviado ? errores.apellidos : undefined}>
          <Input
            id="apellidos"
            value={valores.apellidos}
            onChange={(e) => cambiar('apellidos', e.target.value)}
          />
        </Campo>
        <Campo id="dpi" etiqueta="DPI (CUI)" error={enviado ? errores.dpi : undefined}>
          <Input
            id="dpi"
            inputMode="numeric"
            className="tabular-nums"
            value={valores.dpi}
            onChange={(e) => cambiar('dpi', e.target.value)}
          />
        </Campo>
        <Campo id="puesto" etiqueta="Puesto">
          <Select
            id="puesto"
            value={valores.puesto}
            onChange={(e) => cambiar('puesto', e.target.value)}
          >
            {Object.entries(PUESTOS).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="salarioBase"
          etiqueta="Salario base (Q)"
          error={enviado ? errores.salarioBase : undefined}
        >
          <Input
            id="salarioBase"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={valores.salarioBase}
            onChange={(e) => cambiar('salarioBase', e.target.value)}
          />
        </Campo>
        <Campo
          id="fechaIngreso"
          etiqueta="Fecha de ingreso"
          error={enviado ? errores.fechaIngreso : undefined}
        >
          <Input
            id="fechaIngreso"
            type="date"
            value={valores.fechaIngreso}
            onChange={(e) => cambiar('fechaIngreso', e.target.value)}
          />
        </Campo>
        <Campo
          id="ubicacionEmpleado"
          etiqueta="Ubicación"
          className="sm:col-span-2"
          ayuda={!admin ? 'Solo el administrador traslada empleados a otra ubicación' : undefined}
          error={enviado ? errores.ubicacionId : undefined}
        >
          <Select
            id="ubicacionEmpleado"
            disabled={!admin}
            value={valores.ubicacionId}
            onChange={(e) => cambiar('ubicacionId', e.target.value)}
          >
            <option value="">Seleccione la ubicación</option>
            {ubicaciones.data?.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {empleado ? 'Guardar cambios' : 'Registrar empleado'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Empleados() {
  const usuario = useUsuario();
  const puedeEditar = tieneRol(usuario, ['ADMIN', 'GERENTE']);
  const { ubicacionId } = useFiltroUbicacion();
  const [editando, setEditando] = useState<Empleado | 'nuevo' | null>(null);
  const [baja, setBaja] = useState<Empleado | null>(null);
  const listado = useListado<Empleado, { q: string; puesto: string; activo: string }>(
    'empleados',
    { q: '', puesto: '', activo: 'true' },
    { extra: esGlobal(usuario) ? { ubicacionId } : {} },
  );
  const desactivar = useMutacion((e: Empleado) => api.delete(`/empleados/${e.id}`), {
    invalidar: [['empleados']],
    exito: 'Empleado desactivado',
    errorEnToast: true,
  });
  const mostrarUbicacion = esGlobal(usuario) && !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Empleados"
        descripcion="Personal de cada ubicación con su puesto y salario base. Los repartidores no usan el sistema."
        acciones={
          puedeEditar && (
            <Button variant="primario" onClick={() => setEditando('nuevo')}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Registrar empleado
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-64">
            <Label htmlFor="f-q">Buscar</Label>
            <Input
              id="f-q"
              type="search"
              placeholder="Nombre o DPI"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <Label htmlFor="f-puesto">Puesto</Label>
            <Select
              id="f-puesto"
              value={listado.filtros.puesto}
              onChange={(e) => listado.setFiltro('puesto', e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(PUESTOS).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-36">
            <Label htmlFor="f-activo">Estado</Label>
            <Select
              id="f-activo"
              value={listado.filtros.activo}
              onChange={(e) => listado.setFiltro('activo', e.target.value)}
            >
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
              <option value="">Todos</option>
            </Select>
          </div>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="No hay empleados con estos filtros."
            accion={
              puedeEditar && (
                <Button onClick={() => setEditando('nuevo')}>Registrar empleado</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Puesto</TableHead>
                  {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                  <TableHead>Ingreso</TableHead>
                  <TableHead numerico>Salario base</TableHead>
                  <TableHead>Usuario del sistema</TableHead>
                  {puedeEditar && (
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <span className="font-semibold">
                        {e.nombres} {e.apellidos}
                      </span>
                      {!e.activo && (
                        <span className="ml-2">
                          <BadgeEstado tono="neutro">Inactivo</BadgeEstado>
                        </span>
                      )}
                      <span className="block text-meta text-texto-secundario tabular-nums">
                        DPI {e.dpi}
                      </span>
                    </TableCell>
                    <TableCell>{PUESTOS[e.puesto]}</TableCell>
                    {mostrarUbicacion && <TableCell>{e.ubicacion.nombre}</TableCell>}
                    <TableCell className="tabular-nums">{formatearFecha(e.fechaIngreso)}</TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(e.salarioBase)}
                    </TableCell>
                    <TableCell>
                      {e.usuario ? (
                        e.usuario.email
                      ) : (
                        <span className="text-texto-secundario">Sin acceso</span>
                      )}
                    </TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="terciario" onClick={() => setEditando(e)}>
                          Editar
                        </Button>
                        {e.activo && (
                          <Button size="sm" variant="terciario" onClick={() => setBaja(e)}>
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
      <Dialog open={editando !== null} onOpenChange={(a) => !a && setEditando(null)}>
        {editando !== null && (
          <DialogContent titulo={editando === 'nuevo' ? 'Registrar empleado' : 'Editar empleado'}>
            <FormularioEmpleado
              empleado={editando === 'nuevo' ? undefined : editando}
              onTerminar={() => setEditando(null)}
            />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        abierto={baja !== null}
        onAbiertoChange={(a) => !a && setBaja(null)}
        titulo="Desactivar empleado"
        descripcion={
          baja &&
          `${baja.nombres} ${baja.apellidos} ya no aparecerá en las próximas planillas ni como repartidor. Las planillas anteriores no cambian.`
        }
        textoConfirmar="Desactivar empleado"
        destructivo
        pendiente={desactivar.isPending}
        onConfirmar={() => baja && desactivar.mutate(baja, { onSettled: () => setBaja(null) })}
      />
    </Pagina>
  );
}
