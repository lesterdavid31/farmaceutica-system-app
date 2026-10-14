import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
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
import {
  MESES,
  PUESTOS,
  type EstadoPlanilla,
  type LineaPlanilla,
  type PlanillaDetalle,
  type PlanillaResumen,
  type Ubicacion,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';

export function BadgePlanilla({ estado }: { estado: EstadoPlanilla }) {
  return estado === 'CERRADA' ? (
    <BadgeEstado tono="correcto">Cerrada</BadgeEstado>
  ) : (
    <BadgeEstado tono="advertencia">Borrador</BadgeEstado>
  );
}

function FormularioGenerar({
  onListo,
  onCancelar,
}: {
  onListo: (p: PlanillaDetalle) => void;
  onCancelar: () => void;
}) {
  const usuario = useUsuario();
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const hoy = new Date();
  const [ubicacionId, setUbicacionId] = useState(usuario.ubicacion?.id ?? '');
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const generar = useMutacion(
    () =>
      api.post<PlanillaDetalle>('/planillas', {
        ubicacionId,
        anio: Number(anio),
        mes: Number(mes),
      }),
    { invalidar: [['planillas']], exito: 'Planilla generada' },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ubicacionId) {
          generar.mutate(undefined, { onSuccess: onListo });
        }
      }}
    >
      {generar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={generar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="ubicacionPlanilla" etiqueta="Ubicación" className="sm:col-span-2">
          <Select
            id="ubicacionPlanilla"
            disabled={usuario.rol !== 'ADMIN'}
            value={ubicacionId}
            onChange={(e) => setUbicacionId(e.target.value)}
          >
            <option value="">Seleccione la ubicación</option>
            {ubicaciones.data?.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="mesPlanilla" etiqueta="Mes">
          <Select id="mesPlanilla" value={mes} onChange={(e) => setMes(e.target.value)}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="anioPlanilla" etiqueta="Año">
          <Input
            id="anioPlanilla"
            inputMode="numeric"
            className="tabular-nums"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
        </Campo>
      </div>
      <p className="m-0 mt-4 text-denso text-texto-secundario">
        Se incluyen los empleados activos que ingresaron antes de terminar el mes, con la
        bonificación incentivo y el IGSS de la configuración.
      </p>
      <DialogFooter>
        <Button type="button" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={!ubicacionId || generar.isPending}>
          Generar planilla
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Planillas() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const puedeEditar = tieneRol(usuario, ['ADMIN', 'GERENTE']);
  const { ubicacionId } = useFiltroUbicacion();
  const [generando, setGenerando] = useState(false);
  const listado = useListado<PlanillaResumen, { anio: string; estado: string }>(
    'planillas',
    { anio: String(new Date().getFullYear()), estado: '' },
    { extra: esGlobal(usuario) ? { ubicacionId } : {} },
  );

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Planillas"
        descripcion="Planilla mensual por ubicación. Se editan en borrador y, una vez cerradas, no cambian."
        acciones={
          <>
            <Button asChild>
              <Link to="/planilla/reporte">Ver reporte</Link>
            </Button>
            {puedeEditar && (
              <Button variant="primario" onClick={() => setGenerando(true)}>
                <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
                Generar planilla
              </Button>
            )}
          </>
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-anio">Año</Label>
            <Input
              id="f-anio"
              inputMode="numeric"
              className="w-28 tabular-nums"
              value={listado.filtros.anio}
              onChange={(e) => listado.setFiltro('anio', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <Label htmlFor="f-estado">Estado</Label>
            <Select
              id="f-estado"
              value={listado.filtros.estado}
              onChange={(e) => listado.setFiltro('estado', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="BORRADOR">Borrador</option>
              <option value="CERRADA">Cerradas</option>
            </Select>
          </div>
        </BarraFiltros>
        {listado.isPending ? (
          <Cargando />
        ) : listado.error ? (
          <PanelError error={listado.error} onReintentar={() => void listado.refetch()} />
        ) : listado.data.data.length === 0 ? (
          <EstadoVacio
            texto="No hay planillas con estos filtros."
            accion={
              puedeEditar && <Button onClick={() => setGenerando(true)}>Generar planilla</Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead numerico>Empleados</TableHead>
                  <TableHead numerico>Total líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/planilla/planillas/${p.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/planilla/planillas/${p.id}`}
                        className="font-semibold text-verde-botica"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {MESES[p.mes - 1]} {p.anio}
                      </Link>
                    </TableCell>
                    <TableCell>{p.ubicacion.nombre}</TableCell>
                    <TableCell>
                      <BadgePlanilla estado={p.estado} />
                    </TableCell>
                    <TableCell numerico>{p._count.detalles}</TableCell>
                    <TableCell numerico className="font-semibold whitespace-nowrap">
                      {formatearMoneda(p.total)}
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
      <Dialog open={generando} onOpenChange={setGenerando}>
        {generando && (
          <DialogContent titulo="Generar planilla">
            <FormularioGenerar
              onCancelar={() => setGenerando(false)}
              onListo={(p) => {
                setGenerando(false);
                navegar(`/planilla/planillas/${p.id}`);
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </Pagina>
  );
}

/** Edita bonificación y otros descuentos de una línea; el líquido lo recalcula el servidor. */
function FormularioLinea({
  planillaId,
  linea,
  onTerminar,
}: {
  planillaId: string;
  linea: LineaPlanilla;
  onTerminar: () => void;
}) {
  const [bonificacion, setBonificacion] = useState(linea.bonificacion);
  const [otros, setOtros] = useState(linea.otrosDescuentos);
  const valido = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
  const liquido =
    Number(linea.salarioBase) + Number(bonificacion || 0) - Number(linea.igss) - Number(otros || 0);
  const guardar = useMutacion(
    () =>
      api.patch(`/planillas/${planillaId}/detalles/${linea.id}`, {
        bonificacion: Number(bonificacion),
        otrosDescuentos: Number(otros),
      }),
    { invalidar: [['planillas']], exito: 'Línea actualizada' },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (valido(bonificacion) && valido(otros)) {
          guardar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <dl className="m-0 mb-4 grid grid-cols-2 gap-2 text-denso">
        <dt className="text-texto-secundario">Salario base</dt>
        <dd className="m-0 text-right tabular-nums">{formatearMoneda(linea.salarioBase)}</dd>
        <dt className="text-texto-secundario">IGSS laboral</dt>
        <dd className="m-0 text-right tabular-nums">− {formatearMoneda(linea.igss)}</dd>
      </dl>
      <div className="grid grid-cols-2 gap-4">
        <Campo
          id="bonificacion"
          etiqueta="Bonificación (Q)"
          error={valido(bonificacion) ? undefined : 'Monto con máximo 2 decimales'}
        >
          <Input
            id="bonificacion"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={bonificacion}
            onChange={(e) => setBonificacion(e.target.value)}
          />
        </Campo>
        <Campo
          id="otros"
          etiqueta="Otros descuentos (Q)"
          ayuda="Anticipos, préstamos..."
          error={valido(otros) ? undefined : 'Monto con máximo 2 decimales'}
        >
          <Input
            id="otros"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={otros}
            onChange={(e) => setOtros(e.target.value)}
          />
        </Campo>
      </div>
      <p className="m-0 mt-4 flex justify-between text-cuerpo font-semibold">
        <span>Líquido</span>
        <span className={liquido < 0 ? 'text-ladrillo tabular-nums' : 'tabular-nums'}>
          {formatearMoneda(liquido)}
        </span>
      </p>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          Guardar línea
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DetallePlanilla() {
  const { id } = useParams();
  const navegar = useNavigate();
  const puedeEditar = tieneRol(useUsuario(), ['ADMIN', 'GERENTE']);
  const [linea, setLinea] = useState<LineaPlanilla | null>(null);
  const [confirmar, setConfirmar] = useState<'cerrar' | 'eliminar' | null>(null);
  const consulta = useQuery({
    queryKey: ['planillas', 'detalle', id],
    queryFn: () => api.get<PlanillaDetalle>(`/planillas/${id}`),
  });
  const planilla = consulta.data;
  const borrador = planilla?.estado === 'BORRADOR';
  const cerrar = useMutacion(() => api.post(`/planillas/${id}/cerrar`), {
    invalidar: [['planillas']],
    exito: 'Planilla cerrada',
    errorEnToast: true,
  });
  const eliminar = useMutacion(() => api.delete(`/planillas/${id}`), {
    invalidar: [['planillas']],
    exito: 'Borrador eliminado',
    errorEnToast: true,
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={
          planilla
            ? `Planilla de ${MESES[planilla.mes - 1].toLowerCase()} ${planilla.anio}`
            : 'Planilla'
        }
        descripcion={planilla?.ubicacion.nombre}
        acciones={
          <>
            {puedeEditar && borrador && (
              <>
                <Button variant="terciario" onClick={() => setConfirmar('eliminar')}>
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  Eliminar borrador
                </Button>
                <Button variant="primario" onClick={() => setConfirmar('cerrar')}>
                  <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
                  Cerrar planilla
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/planilla/planillas">Volver a planillas</Link>
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
        planilla && (
          <>
            <Panel className="mb-6">
              <dl className="m-0 grid gap-x-8 gap-y-3 p-4 text-denso sm:grid-cols-4">
                <div>
                  <dt className="text-texto-secundario">Estado</dt>
                  <dd className="m-0 mt-0.5">
                    <BadgePlanilla estado={planilla.estado} />
                  </dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Empleados</dt>
                  <dd className="m-0 font-semibold">{planilla.detalles.length}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Total líquido</dt>
                  <dd className="m-0 text-seccion font-semibold tabular-nums">
                    {formatearMoneda(planilla.total)}
                  </dd>
                </div>
                {planilla.fechaCierre && (
                  <div>
                    <dt className="text-texto-secundario">Cerrada</dt>
                    <dd className="m-0 tabular-nums">{formatearFechaHora(planilla.fechaCierre)}</dd>
                    <dd className="m-0 text-texto-secundario">{planilla.cerradaPor?.nombre}</dd>
                  </div>
                )}
              </dl>
            </Panel>
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead numerico>Salario base</TableHead>
                    <TableHead numerico>Bonificación</TableHead>
                    <TableHead numerico>IGSS</TableHead>
                    <TableHead numerico>Otros desc.</TableHead>
                    <TableHead numerico>Líquido</TableHead>
                    {puedeEditar && borrador && (
                      <TableHead>
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planilla.detalles.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <span className="font-semibold">
                          {l.empleado.nombres} {l.empleado.apellidos}
                        </span>
                        <span className="block text-meta text-texto-secundario">
                          {PUESTOS[l.empleado.puesto]}
                        </span>
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(l.salarioBase)}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(l.bonificacion)}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(l.igss)}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(l.otrosDescuentos)}
                      </TableCell>
                      <TableCell numerico className="font-semibold whitespace-nowrap">
                        {formatearMoneda(l.liquido)}
                      </TableCell>
                      {puedeEditar && borrador && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="terciario" onClick={() => setLinea(l)}>
                            Editar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  <TableRow className="bg-fondo font-semibold hover:bg-fondo">
                    <TableCell>Totales</TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(planilla.totales.salarioBase)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(planilla.totales.bonificacion)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(planilla.totales.igss)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(planilla.totales.otrosDescuentos)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(planilla.totales.liquido)}
                    </TableCell>
                    {puedeEditar && borrador && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </Panel>
            <Dialog open={linea !== null} onOpenChange={(a) => !a && setLinea(null)}>
              {linea && (
                <DialogContent titulo={`${linea.empleado.nombres} ${linea.empleado.apellidos}`}>
                  <FormularioLinea
                    planillaId={planilla.id}
                    linea={linea}
                    onTerminar={() => setLinea(null)}
                  />
                </DialogContent>
              )}
            </Dialog>
            <ConfirmDialog
              abierto={confirmar === 'cerrar'}
              onAbiertoChange={(a) => !a && setConfirmar(null)}
              titulo="Cerrar planilla"
              descripcion={`Se cerrará la planilla con un total líquido de ${formatearMoneda(planilla.total)}. Una planilla cerrada no se puede modificar ni eliminar.`}
              textoConfirmar="Cerrar planilla"
              pendiente={cerrar.isPending}
              onConfirmar={() => cerrar.mutate(undefined, { onSettled: () => setConfirmar(null) })}
            />
            <ConfirmDialog
              abierto={confirmar === 'eliminar'}
              onAbiertoChange={(a) => !a && setConfirmar(null)}
              titulo="Eliminar borrador"
              descripcion="Se eliminará este borrador para que pueda generarlo de nuevo, por ejemplo después de cambiar un salario."
              textoConfirmar="Eliminar borrador"
              destructivo
              pendiente={eliminar.isPending}
              onConfirmar={() =>
                eliminar.mutate(undefined, {
                  onSuccess: () => navegar('/planilla/planillas'),
                  onSettled: () => setConfirmar(null),
                })
              }
            />
          </>
        )
      )}
    </Pagina>
  );
}
