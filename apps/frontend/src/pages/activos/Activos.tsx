import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
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
import { Input, Label, Select, Textarea } from '@/components/ui/input';
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
import type { ActivoDetalle, ActivoFijo, CategoriaActivo, Ubicacion } from '@/lib/dominio';
import { formatearFecha, formatearFechaHora, formatearMoneda } from '@/lib/formato';

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const MONTO = /^\d+(\.\d{1,2})?$/;
const anios = (meses: number) =>
  meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? 'año' : 'años'}` : `${meses} meses`;

function useCategorias() {
  return useCatalogo<CategoriaActivo[]>('activos', '/activos/categorias');
}

// ─── Formulario de activo ─────────────────────────────────────────────────────

function FormularioActivo({ activo, onTerminar }: { activo?: ActivoFijo; onTerminar: () => void }) {
  const navegar = useNavigate();
  const categorias = useCategorias();
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const [v, setV] = useState({
    codigo: activo?.codigo ?? '',
    descripcion: activo?.descripcion ?? '',
    categoriaId: activo?.categoriaId ?? '',
    ubicacionId: activo?.ubicacionId ?? '',
    fechaAdquisicion: activo?.fechaAdquisicion.slice(0, 10) ?? hoyLocal(),
    costo: activo?.costo ?? '',
    valorResidual: activo?.valorResidual ?? '0',
    vidaUtilMeses: activo ? String(activo.vidaUtilMeses) : '',
  });
  const [enviado, setEnviado] = useState(false);
  const cambiar = (clave: keyof typeof v, valor: string) => setV((x) => ({ ...x, [clave]: valor }));
  const categoria = categorias.data?.find((c) => c.id === v.categoriaId);
  const vida = Number(v.vidaUtilMeses || categoria?.vidaUtilMeses || 0);
  const mensual =
    MONTO.test(v.costo) && MONTO.test(v.valorResidual) && vida > 0
      ? (Number(v.costo) - Number(v.valorResidual)) / vida
      : null;
  const errores = {
    codigo: /^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/.test(v.codigo.trim())
      ? undefined
      : 'Letras, números y guiones',
    descripcion: v.descripcion.trim().length < 3 ? 'Describa el activo' : undefined,
    categoriaId: v.categoriaId ? undefined : 'Seleccione la categoría',
    ubicacionId: activo || v.ubicacionId ? undefined : 'Seleccione la ubicación',
    fechaAdquisicion:
      v.fechaAdquisicion && v.fechaAdquisicion <= hoyLocal()
        ? undefined
        : 'La fecha no puede ser futura',
    costo: MONTO.test(v.costo) && Number(v.costo) > 0 ? undefined : 'Monto mayor que cero',
    valorResidual: !MONTO.test(v.valorResidual)
      ? 'Monto con máximo 2 decimales'
      : Number(v.valorResidual) > Number(v.costo)
        ? 'No puede ser mayor que el costo'
        : undefined,
    vidaUtilMeses:
      v.vidaUtilMeses === '' || (/^\d+$/.test(v.vidaUtilMeses) && Number(v.vidaUtilMeses) > 0)
        ? undefined
        : 'Meses enteros mayores que cero',
  };
  const guardar = useMutacion(
    () => {
      const cuerpo = {
        codigo: v.codigo.trim().toUpperCase(),
        descripcion: v.descripcion.trim(),
        categoriaId: v.categoriaId,
        fechaAdquisicion: v.fechaAdquisicion,
        costo: Number(v.costo),
        valorResidual: Number(v.valorResidual),
        ...(v.vidaUtilMeses !== '' && { vidaUtilMeses: Number(v.vidaUtilMeses) }),
      };
      return activo
        ? api.patch<ActivoDetalle>(`/activos/${activo.id}`, cuerpo)
        : api.post<ActivoDetalle>('/activos', { ...cuerpo, ubicacionId: v.ubicacionId });
    },
    { invalidar: [['activos']], exito: activo ? 'Activo actualizado' : 'Activo registrado' },
  );
  const error = (clave: keyof typeof errores) => (enviado ? errores[clave] : undefined);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!Object.values(errores).some(Boolean)) {
          guardar.mutate(undefined, {
            onSuccess: (a) => {
              onTerminar();
              if (!activo) {
                navegar(`/activos/${a.id}`);
              }
            },
          });
        }
      }}
    >
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="codigo" etiqueta="Código" error={error('codigo')}>
          <Input
            id="codigo"
            className="uppercase"
            value={v.codigo}
            onChange={(e) => cambiar('codigo', e.target.value)}
          />
        </Campo>
        <Campo id="categoria" etiqueta="Categoría" error={error('categoriaId')}>
          <Select
            id="categoria"
            value={v.categoriaId}
            onChange={(e) => cambiar('categoriaId', e.target.value)}
          >
            <option value="">Seleccione la categoría</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({anios(c.vidaUtilMeses)})
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          id="descripcion"
          etiqueta="Descripción"
          className="sm:col-span-2"
          error={error('descripcion')}
        >
          <Input
            id="descripcion"
            value={v.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />
        </Campo>
        {!activo && (
          <Campo
            id="ubicacionActivo"
            etiqueta="Ubicación"
            className="sm:col-span-2"
            error={error('ubicacionId')}
          >
            <Select
              id="ubicacionActivo"
              value={v.ubicacionId}
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
        )}
        <Campo
          id="fechaAdquisicion"
          etiqueta="Fecha de adquisición"
          error={error('fechaAdquisicion')}
        >
          <Input
            id="fechaAdquisicion"
            type="date"
            value={v.fechaAdquisicion}
            onChange={(e) => cambiar('fechaAdquisicion', e.target.value)}
          />
        </Campo>
        <Campo id="costo" etiqueta="Costo (Q)" error={error('costo')}>
          <Input
            id="costo"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={v.costo}
            onChange={(e) => cambiar('costo', e.target.value)}
          />
        </Campo>
        <Campo id="residual" etiqueta="Valor residual (Q)" error={error('valorResidual')}>
          <Input
            id="residual"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={v.valorResidual}
            onChange={(e) => cambiar('valorResidual', e.target.value)}
          />
        </Campo>
        <Campo
          id="vida"
          etiqueta="Vida útil (meses)"
          ayuda={categoria ? `Vacío: ${categoria.vidaUtilMeses} meses de la categoría` : undefined}
          error={error('vidaUtilMeses')}
        >
          <Input
            id="vida"
            inputMode="numeric"
            className="text-right tabular-nums"
            placeholder={categoria ? String(categoria.vidaUtilMeses) : ''}
            value={v.vidaUtilMeses}
            onChange={(e) => cambiar('vidaUtilMeses', e.target.value)}
          />
        </Campo>
      </div>
      {mensual !== null && mensual >= 0 && (
        <p className="m-0 mt-4 text-denso">
          Depreciación mensual: <strong className="tabular-nums">{formatearMoneda(mensual)}</strong>{' '}
          <span className="text-texto-secundario">(costo − residual) / vida útil</span>
        </p>
      )}
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {activo ? 'Guardar cambios' : 'Registrar activo'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DialogoCategorias({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const categorias = useCategorias();
  const [valores, setValores] = useState<Record<string, string>>({});
  const guardar = useMutacion(
    (c: { id: string; vidaUtilMeses: number }) =>
      api.patch(`/activos/categorias/${c.id}`, { vidaUtilMeses: c.vidaUtilMeses }),
    { invalidar: [['activos']], exito: 'Vida útil actualizada', errorEnToast: true },
  );
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent
          titulo="Categorías de activos"
          descripcion="Vida útil por defecto de cada categoría. Cambiarla no altera los activos ya registrados."
        >
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {categorias.data?.map((c) => {
              const texto = valores[c.id] ?? String(c.vidaUtilMeses);
              const valido = /^\d+$/.test(texto) && Number(texto) > 0;
              return (
                <li key={c.id} className="flex items-center gap-3 text-denso">
                  <span className="flex-1">
                    <span className="block font-semibold">{c.nombre}</span>
                    <span className="text-meta text-texto-secundario">
                      {c._count?.activos ?? 0} activos
                    </span>
                  </span>
                  <Input
                    aria-label={`Vida útil de ${c.nombre} en meses`}
                    inputMode="numeric"
                    className="w-24 text-right tabular-nums"
                    value={texto}
                    onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))}
                  />
                  <span className="w-12 text-texto-secundario">meses</span>
                  <Button
                    size="sm"
                    disabled={!valido || Number(texto) === c.vidaUtilMeses || guardar.isPending}
                    onClick={() => guardar.mutate({ id: c.id, vidaUtilMeses: Number(texto) })}
                  >
                    Guardar
                  </Button>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button onClick={onCerrar}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Listado ──────────────────────────────────────────────────────────────────

export function Activos() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const admin = usuario.rol === 'ADMIN';
  const { ubicacionId } = useFiltroUbicacion();
  const categorias = useCategorias();
  const [nuevo, setNuevo] = useState(false);
  const [viendoCategorias, setViendoCategorias] = useState(false);
  const listado = useListado<ActivoFijo, { q: string; categoriaId: string; activo: string }>(
    'activos',
    { q: '', categoriaId: '', activo: 'true' },
    { extra: esGlobal(usuario) ? { ubicacionId } : {} },
  );
  const mostrarUbicacion = esGlobal(usuario) && !ubicacionId;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Activos fijos"
        descripcion="Mobiliario, equipo, vehículos y edificios con su valor en libros a hoy (depreciación lineal)."
        acciones={
          <>
            <Button asChild>
              <Link to="/activos/reporte">Ver reporte</Link>
            </Button>
            {admin && (
              <>
                <Button onClick={() => setViendoCategorias(true)}>
                  <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  Categorías
                </Button>
                <Button variant="primario" onClick={() => setNuevo(true)}>
                  <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
                  Registrar activo
                </Button>
              </>
            )}
          </>
        }
      />
      <Panel>
        <BarraFiltros>
          <div className="flex w-full flex-col gap-1 sm:w-64">
            <Label htmlFor="f-q">Buscar</Label>
            <Input
              id="f-q"
              type="search"
              placeholder="Código o descripción"
              value={listado.filtros.q}
              onChange={(e) => listado.setFiltro('q', e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <Label htmlFor="f-cat">Categoría</Label>
            <Select
              id="f-cat"
              value={listado.filtros.categoriaId}
              onChange={(e) => listado.setFiltro('categoriaId', e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
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
              <option value="true">En uso</option>
              <option value="false">Dados de baja</option>
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
            texto="No hay activos con estos filtros."
            accion={admin && <Button onClick={() => setNuevo(true)}>Registrar activo</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activo</TableHead>
                  <TableHead>Categoría</TableHead>
                  {mostrarUbicacion && <TableHead>Ubicación</TableHead>}
                  <TableHead>Adquisición</TableHead>
                  <TableHead numerico>Costo</TableHead>
                  <TableHead numerico>Dep. acumulada</TableHead>
                  <TableHead numerico>Valor en libros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navegar(`/activos/${a.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/activos/${a.id}`}
                        className="font-semibold text-verde-botica"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.codigo}
                      </Link>
                      {!a.activo && (
                        <span className="ml-2">
                          <BadgeEstado tono="neutro">De baja</BadgeEstado>
                        </span>
                      )}
                      <span className="block text-meta text-texto-secundario">{a.descripcion}</span>
                    </TableCell>
                    <TableCell>{a.categoria.nombre}</TableCell>
                    {mostrarUbicacion && <TableCell>{a.ubicacion.nombre}</TableCell>}
                    <TableCell className="tabular-nums">
                      {formatearFecha(a.fechaAdquisicion)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(a.costo)}
                    </TableCell>
                    <TableCell numerico className="whitespace-nowrap">
                      {formatearMoneda(a.depreciacion.depreciacionAcumulada)}
                    </TableCell>
                    <TableCell numerico className="font-semibold whitespace-nowrap">
                      {formatearMoneda(a.depreciacion.valorEnLibros)}
                      {a.depreciacion.totalmenteDepreciado && (
                        <span className="block text-meta font-normal text-texto-secundario">
                          Totalmente depreciado
                        </span>
                      )}
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
      <Dialog open={nuevo} onOpenChange={setNuevo}>
        {nuevo && (
          <DialogContent titulo="Registrar activo" className="max-w-2xl">
            <FormularioActivo onTerminar={() => setNuevo(false)} />
          </DialogContent>
        )}
      </Dialog>
      <DialogoCategorias abierto={viendoCategorias} onCerrar={() => setViendoCategorias(false)} />
    </Pagina>
  );
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

function FormularioTraslado({
  activo,
  onTerminar,
}: {
  activo: ActivoDetalle;
  onTerminar: () => void;
}) {
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const errores = {
    destino: destino ? undefined : 'Seleccione el destino',
    motivo: motivo.trim().length < 5 ? 'Explique el motivo (mínimo 5 caracteres)' : undefined,
  };
  const trasladar = useMutacion(
    () =>
      api.post(`/activos/${activo.id}/trasladar`, {
        ubicacionDestinoId: destino,
        motivo: motivo.trim(),
      }),
    { invalidar: [['activos']], exito: 'Activo trasladado' },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!errores.destino && !errores.motivo) {
          trasladar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {trasladar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={trasladar.error} />
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Campo
          id="destinoActivo"
          etiqueta="Ubicación de destino"
          error={enviado ? errores.destino : undefined}
        >
          <Select id="destinoActivo" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Seleccione el destino</option>
            {ubicaciones.data?.data
              .filter((u) => u.id !== activo.ubicacionId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo id="motivoTraslado" etiqueta="Motivo" error={enviado ? errores.motivo : undefined}>
          <Textarea
            id="motivoTraslado"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={trasladar.isPending}>
          Trasladar activo
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DetalleActivo() {
  const { id } = useParams();
  const admin = useUsuario().rol === 'ADMIN';
  const [dialogo, setDialogo] = useState<'editar' | 'trasladar' | 'baja' | null>(null);
  const consulta = useQuery({
    queryKey: ['activos', 'detalle', id],
    queryFn: () => api.get<ActivoDetalle>(`/activos/${id}`),
  });
  const a = consulta.data;
  const baja = useMutacion(() => api.delete(`/activos/${id}`), {
    invalidar: [['activos']],
    exito: 'Activo dado de baja',
    errorEnToast: true,
  });
  const hoy = new Date().getFullYear();

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={a ? `${a.codigo} · ${a.descripcion}` : 'Activo'}
        descripcion={a && `${a.categoria.nombre} · ${a.ubicacion.nombre}`}
        acciones={
          <>
            {admin && a?.activo && (
              <>
                <Button variant="terciario" onClick={() => setDialogo('baja')}>
                  Dar de baja
                </Button>
                <Button onClick={() => setDialogo('editar')}>
                  <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                  Editar
                </Button>
                <Button variant="primario" onClick={() => setDialogo('trasladar')}>
                  <ArrowRightLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                  Trasladar activo
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/activos">Volver a activos</Link>
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
        a && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-6">
              <Panel>
                <div className="grid grid-cols-2 divide-borde sm:grid-cols-4 sm:divide-x">
                  {[
                    ['Costo', formatearMoneda(a.costo)],
                    ['Depreciación mensual', formatearMoneda(a.depreciacion.depreciacionMensual)],
                    [
                      'Depreciación acumulada',
                      formatearMoneda(a.depreciacion.depreciacionAcumulada),
                    ],
                    ['Valor en libros hoy', formatearMoneda(a.depreciacion.valorEnLibros)],
                  ].map(([etiqueta, valor], i) => (
                    <div key={etiqueta} className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-meta text-texto-secundario">{etiqueta}</span>
                      <span
                        className={
                          i === 3
                            ? 'text-seccion font-semibold tabular-nums'
                            : 'font-semibold tabular-nums'
                        }
                      >
                        {valor}
                      </span>
                    </div>
                  ))}
                </div>
                <dl className="m-0 grid gap-x-8 gap-y-2 border-t border-borde p-4 text-denso sm:grid-cols-4">
                  <div>
                    <dt className="text-texto-secundario">Adquisición</dt>
                    <dd className="m-0 tabular-nums">{formatearFecha(a.fechaAdquisicion)}</dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Vida útil</dt>
                    <dd className="m-0">
                      {a.vidaUtilMeses} meses ({anios(a.vidaUtilMeses)})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Valor residual</dt>
                    <dd className="m-0 tabular-nums">{formatearMoneda(a.valorResidual)}</dd>
                  </div>
                  <div>
                    <dt className="text-texto-secundario">Fin de la vida útil</dt>
                    <dd className="m-0 tabular-nums">{formatearFecha(a.fechaFinVidaUtil)}</dd>
                    <dd className="m-0 text-meta text-texto-secundario">
                      {a.depreciacion.mesesDepreciados} de {a.vidaUtilMeses} meses depreciados
                    </dd>
                  </div>
                </dl>
              </Panel>
              <Panel>
                <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                  Depreciación por año
                </h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Año</TableHead>
                      <TableHead numerico>Depreciación del año</TableHead>
                      <TableHead numerico>Acumulada</TableHead>
                      <TableHead numerico>Valor en libros al cierre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.calendario.map((f) => (
                      <TableRow
                        key={f.anio}
                        className={f.anio === hoy ? 'bg-salvia hover:bg-salvia' : undefined}
                      >
                        <TableCell className="tabular-nums">{f.anio}</TableCell>
                        <TableCell numerico>{formatearMoneda(f.depreciacionAnio)}</TableCell>
                        <TableCell numerico>{formatearMoneda(f.depreciacionAcumulada)}</TableCell>
                        <TableCell numerico className="font-semibold">
                          {formatearMoneda(f.valorEnLibros)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            </div>
            <Panel className="self-start">
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Historial de ubicaciones
              </h2>
              <ol className="m-0 list-none p-4">
                {[...a.historialUbicaciones].reverse().map((h) => (
                  <li
                    key={h.id}
                    className="border-b border-borde py-3 text-denso first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <span className="block font-semibold">
                      {h.ubicacionOrigen ? `${h.ubicacionOrigen.nombre} → ` : ''}
                      {h.ubicacionDestino.nombre}
                    </span>
                    {h.motivo && <span className="block">{h.motivo}</span>}
                    <span className="block text-texto-secundario tabular-nums">
                      {formatearFechaHora(h.createdAt)} · {h.usuario.nombre}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        )
      )}
      {a && (
        <>
          <Dialog open={dialogo === 'editar'} onOpenChange={(x) => !x && setDialogo(null)}>
            {dialogo === 'editar' && (
              <DialogContent titulo={`Editar ${a.codigo}`} className="max-w-2xl">
                <FormularioActivo activo={a} onTerminar={() => setDialogo(null)} />
              </DialogContent>
            )}
          </Dialog>
          <Dialog open={dialogo === 'trasladar'} onOpenChange={(x) => !x && setDialogo(null)}>
            {dialogo === 'trasladar' && (
              <DialogContent
                titulo={`Trasladar ${a.codigo}`}
                descripcion={`Está en ${a.ubicacion.nombre}. El traslado queda en el historial.`}
              >
                <FormularioTraslado activo={a} onTerminar={() => setDialogo(null)} />
              </DialogContent>
            )}
          </Dialog>
          <ConfirmDialog
            abierto={dialogo === 'baja'}
            onAbiertoChange={(x) => !x && setDialogo(null)}
            titulo={`Dar de baja ${a.codigo}`}
            descripcion="El activo deja de aparecer en el reporte de valor en libros. Su historial se conserva."
            textoConfirmar="Dar de baja"
            destructivo
            pendiente={baja.isPending}
            onConfirmar={() => baja.mutate(undefined, { onSettled: () => setDialogo(null) })}
          />
        </>
      )}
    </Pagina>
  );
}
