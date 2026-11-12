import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { usaSelectorUbicacion } from '@/auth/permisos';
import { tieneRol, useUsuario } from '@/auth/sesion';
import { BadgeEstado, type TonoEstado } from '@/components/BadgeEstado';
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
import {
  ESTADOS_SOLICITUD,
  ROLES,
  type EstadoSolicitudUsuario,
  type SolicitudUsuario,
  type Ubicacion,
} from '@/lib/dominio';
import { formatearFechaHora } from '@/lib/formato';

const TONO: Record<EstadoSolicitudUsuario, TonoEstado> = {
  PENDIENTE: 'advertencia',
  APROBADA: 'proceso',
  RECHAZADA: 'neutro',
  ATENDIDA: 'correcto',
};
const PASSWORD = /(?=.*[A-Za-z])(?=.*\d)/;
const MENSAJE_PASSWORD = 'Use al menos 8 caracteres, con letras y números';

/** El gerente pide la cuenta de un gerente o cajero de su ubicación. */
function FormularioSolicitud({ onTerminar }: { onTerminar: () => void }) {
  const usuario = useUsuario();
  const general = usuario.rol === 'GERENTE_GENERAL';
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const [valores, setValores] = useState({
    nombre: '',
    email: '',
    rol: 'CAJERO' as 'CAJERO' | 'GERENTE',
    ubicacionId: usuario.ubicacion?.id ?? '',
    justificacion: '',
  });
  const [enviado, setEnviado] = useState(false);
  const cambiar = (clave: keyof typeof valores, valor: string) =>
    setValores((v) => ({ ...v, [clave]: valor }));
  const errores = {
    nombre: valores.nombre.trim().length < 2 ? 'Ingrese el nombre completo' : undefined,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())
      ? undefined
      : 'Ingrese un correo electrónico válido',
    ubicacionId: valores.ubicacionId ? undefined : 'Seleccione la ubicación',
  };
  const guardar = useMutacion(
    () =>
      api.post<SolicitudUsuario>('/solicitudes-usuario', {
        nombre: valores.nombre.trim(),
        email: valores.email.trim().toLowerCase(),
        rol: valores.rol,
        ubicacionId: valores.ubicacionId,
        ...(valores.justificacion.trim() && { justificacion: valores.justificacion.trim() }),
      }),
    {
      invalidar: [['solicitudes-usuario']],
      exito: (s) =>
        s.estado === 'APROBADA'
          ? `Solicitud #${s.numero} aprobada: queda en espera de TI`
          : `Solicitud #${s.numero} enviada al gerente general`,
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
        <Campo
          id="sol-nombre"
          etiqueta="Nombre completo"
          className="sm:col-span-2"
          error={enviado ? errores.nombre : undefined}
        >
          <Input
            id="sol-nombre"
            value={valores.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
          />
        </Campo>
        <Campo
          id="sol-email"
          etiqueta="Correo electrónico"
          className="sm:col-span-2"
          ayuda="Será el usuario para iniciar sesión."
          error={enviado ? errores.email : undefined}
        >
          <Input
            id="sol-email"
            type="email"
            value={valores.email}
            onChange={(e) => cambiar('email', e.target.value)}
          />
        </Campo>
        <Campo id="sol-rol" etiqueta="Rol">
          <Select id="sol-rol" value={valores.rol} onChange={(e) => cambiar('rol', e.target.value)}>
            <option value="CAJERO">{ROLES.CAJERO}</option>
            <option value="GERENTE">{ROLES.GERENTE}</option>
          </Select>
        </Campo>
        <Campo
          id="sol-ubicacion"
          etiqueta="Ubicación"
          ayuda={general ? undefined : 'Solo puede pedir cuentas para su ubicación'}
          error={enviado ? errores.ubicacionId : undefined}
        >
          <Select
            id="sol-ubicacion"
            disabled={!general}
            value={valores.ubicacionId}
            onChange={(e) => cambiar('ubicacionId', e.target.value)}
          >
            <option value="">Seleccione la ubicación</option>
            {ubicaciones.data?.data
              .filter((u) => !(valores.rol === 'CAJERO' && u.tipo === 'BODEGA_CENTRAL'))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo
          id="sol-justificacion"
          etiqueta="Justificación (opcional)"
          className="sm:col-span-2"
          ayuda="Por ejemplo: cajero nuevo para el turno de la tarde."
        >
          <Input
            id="sol-justificacion"
            value={valores.justificacion}
            onChange={(e) => cambiar('justificacion', e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          Solicitar cuenta
        </Button>
      </DialogFooter>
    </form>
  );
}

/** El gerente general rechaza con motivo. */
function FormularioRechazo({
  solicitud,
  onTerminar,
}: {
  solicitud: SolicitudUsuario;
  onTerminar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const error =
    motivo.trim().length < 5 ? 'Explique el motivo del rechazo (mínimo 5 caracteres)' : undefined;
  const rechazar = useMutacion(
    () => api.post(`/solicitudes-usuario/${solicitud.id}/rechazar`, { motivo: motivo.trim() }),
    { invalidar: [['solicitudes-usuario']], exito: `Solicitud #${solicitud.numero} rechazada` },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!error) {
          rechazar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {rechazar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={rechazar.error} />
        </div>
      )}
      <Campo id="motivo-rechazo" etiqueta="Motivo" error={enviado ? error : undefined}>
        <Input id="motivo-rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="destructivo" disabled={rechazar.isPending}>
          Rechazar solicitud
        </Button>
      </DialogFooter>
    </form>
  );
}

/** TI crea la cuenta con los datos aprobados; solo define la contraseña inicial. */
function FormularioCuenta({
  solicitud,
  onTerminar,
}: {
  solicitud: SolicitudUsuario;
  onTerminar: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviado, setEnviado] = useState(false);
  const errores = {
    password: password.length >= 8 && PASSWORD.test(password) ? undefined : MENSAJE_PASSWORD,
    confirmacion: confirmacion === password ? undefined : 'Las contraseñas no coinciden',
  };
  const crear = useMutacion(
    () => api.post(`/solicitudes-usuario/${solicitud.id}/crear-cuenta`, { password }),
    {
      invalidar: [['solicitudes-usuario'], ['usuarios']],
      exito: `Cuenta de ${solicitud.email} creada`,
    },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!Object.values(errores).some(Boolean)) {
          crear.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {crear.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={crear.error} />
        </div>
      )}
      <dl className="m-0 mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-denso">
        <dt className="text-texto-secundario">Nombre</dt>
        <dd className="m-0">{solicitud.nombre}</dd>
        <dt className="text-texto-secundario">Correo</dt>
        <dd className="m-0">{solicitud.email}</dd>
        <dt className="text-texto-secundario">Rol</dt>
        <dd className="m-0">
          {ROLES[solicitud.rol]} · {solicitud.ubicacion.nombre}
        </dd>
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="cuenta-password"
          etiqueta="Contraseña inicial"
          ayuda={MENSAJE_PASSWORD}
          error={enviado ? errores.password : undefined}
        >
          <Input
            id="cuenta-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>
        <Campo
          id="cuenta-confirmacion"
          etiqueta="Confirmar contraseña"
          error={enviado ? errores.confirmacion : undefined}
        >
          <Input
            id="cuenta-confirmacion"
            type="password"
            autoComplete="new-password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={crear.isPending}>
          Crear cuenta
        </Button>
      </DialogFooter>
    </form>
  );
}

type Dialogo =
  { tipo: 'nueva' } | { tipo: 'aprobar' | 'rechazar' | 'cuenta'; solicitud: SolicitudUsuario };

export function SolicitudesCuenta() {
  const usuario = useUsuario();
  const puedeSolicitar = tieneRol(usuario, ['GERENTE_GENERAL', 'GERENTE']);
  const { ubicacionId } = useFiltroUbicacion();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const cerrar = () => setDialogo(null);
  // Cada rol abre la pantalla en lo que le toca atender.
  const estadoInicial =
    usuario.rol === 'GERENTE_GENERAL' ? 'PENDIENTE' : usuario.rol === 'ADMIN' ? 'APROBADA' : '';
  const listado = useListado<SolicitudUsuario, { q: string; estado: string }>(
    'solicitudes-usuario',
    { q: '', estado: estadoInicial },
    { extra: usaSelectorUbicacion(usuario) ? { ubicacionId } : {} },
  );
  const aprobar = useMutacion(
    (s: SolicitudUsuario) => api.post(`/solicitudes-usuario/${s.id}/aprobar`),
    {
      invalidar: [['solicitudes-usuario']],
      exito: 'Solicitud aprobada: queda en espera de TI',
      errorEnToast: true,
    },
  );

  const descripcion =
    usuario.rol === 'ADMIN'
      ? 'Cree las cuentas que aprobó el gerente general.'
      : usuario.rol === 'GERENTE_GENERAL'
        ? 'Apruebe o rechace las cuentas que piden los gerentes; TI las crea después.'
        : usuario.rol === 'GERENTE'
          ? 'Pida la cuenta de un gerente o cajero nuevo. Cuando TI la cree, vincúlela a su empleado en Empleados.'
          : 'Solicitudes de cuenta de usuario y quién las aprobó y creó.';

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Solicitudes de cuenta"
        descripcion={descripcion}
        acciones={
          puedeSolicitar && (
            <Button variant="primario" onClick={() => setDialogo({ tipo: 'nueva' })}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Solicitar cuenta
            </Button>
          )
        }
      />
      <Panel>
        <BarraFiltros>
          <Input
            type="search"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar solicitudes"
            className="w-full sm:w-72"
            value={listado.filtros.q}
            onChange={(e) => listado.setFiltro('q', e.target.value)}
          />
          <Select
            aria-label="Filtrar por estado"
            className="w-full sm:w-56"
            value={listado.filtros.estado}
            onChange={(e) => listado.setFiltro('estado', e.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_SOLICITUD).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
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
            texto="No hay solicitudes con estos filtros."
            accion={
              puedeSolicitar && (
                <Button onClick={() => setDialogo({ tipo: 'nueva' })}>Solicitar cuenta</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitud</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Rol y ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.data.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-semibold tabular-nums">#{s.numero}</span>
                      <span className="block text-meta text-texto-secundario">
                        {s.solicitadoPor.nombre}
                      </span>
                      <span className="block text-meta text-texto-secundario tabular-nums">
                        {formatearFechaHora(s.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{s.nombre}</span>
                      <span className="block text-meta text-texto-secundario">{s.email}</span>
                      {s.justificacion && (
                        <span className="block text-meta text-texto-secundario">
                          {s.justificacion}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ROLES[s.rol]}
                      <span className="block text-meta text-texto-secundario">
                        {s.ubicacion.nombre}
                      </span>
                    </TableCell>
                    <TableCell>
                      <BadgeEstado tono={TONO[s.estado]}>{ESTADOS_SOLICITUD[s.estado]}</BadgeEstado>
                      {s.revisadoPor && (
                        <span className="block text-meta text-texto-secundario">
                          {s.estado === 'RECHAZADA' ? 'Rechazó' : 'Aprobó'}: {s.revisadoPor.nombre}
                        </span>
                      )}
                      {s.motivoRechazo && (
                        <span className="block text-meta text-texto-secundario">
                          {s.motivoRechazo}
                        </span>
                      )}
                      {s.atendidoPor && (
                        <span className="block text-meta text-texto-secundario">
                          Creó la cuenta: {s.atendidoPor.nombre}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {s.acciones.includes('aprobar') && (
                        <Button
                          size="sm"
                          variant="primario"
                          onClick={() => setDialogo({ tipo: 'aprobar', solicitud: s })}
                        >
                          Aprobar
                        </Button>
                      )}
                      {s.acciones.includes('rechazar') && (
                        <Button
                          size="sm"
                          variant="terciario"
                          onClick={() => setDialogo({ tipo: 'rechazar', solicitud: s })}
                        >
                          Rechazar
                        </Button>
                      )}
                      {s.acciones.includes('crearCuenta') && (
                        <Button
                          size="sm"
                          variant="primario"
                          onClick={() => setDialogo({ tipo: 'cuenta', solicitud: s })}
                        >
                          Crear cuenta
                        </Button>
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

      <Dialog
        open={dialogo !== null && dialogo.tipo !== 'aprobar'}
        onOpenChange={(abierto) => !abierto && cerrar()}
      >
        {dialogo?.tipo === 'nueva' && (
          <DialogContent
            titulo="Solicitar cuenta"
            descripcion="El gerente general la revisa y, si la aprueba, TI crea la cuenta."
          >
            <FormularioSolicitud onTerminar={cerrar} />
          </DialogContent>
        )}
        {dialogo?.tipo === 'rechazar' && (
          <DialogContent
            titulo={`Rechazar solicitud #${dialogo.solicitud.numero}`}
            descripcion={`${dialogo.solicitud.nombre} · ${dialogo.solicitud.email}`}
          >
            <FormularioRechazo solicitud={dialogo.solicitud} onTerminar={cerrar} />
          </DialogContent>
        )}
        {dialogo?.tipo === 'cuenta' && (
          <DialogContent titulo={`Crear cuenta · solicitud #${dialogo.solicitud.numero}`}>
            <FormularioCuenta solicitud={dialogo.solicitud} onTerminar={cerrar} />
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        abierto={dialogo?.tipo === 'aprobar'}
        onAbiertoChange={(abierto) => !abierto && cerrar()}
        titulo="Aprobar solicitud"
        descripcion={
          dialogo?.tipo === 'aprobar'
            ? `${dialogo.solicitud.nombre} recibirá una cuenta de ${ROLES[dialogo.solicitud.rol].toLowerCase()} en ${dialogo.solicitud.ubicacion.nombre}. TI la creará después.`
            : ''
        }
        textoConfirmar="Aprobar solicitud"
        pendiente={aprobar.isPending}
        onConfirmar={() =>
          dialogo?.tipo === 'aprobar' && aprobar.mutate(dialogo.solicitud, { onSettled: cerrar })
        }
      />
    </Pagina>
  );
}
