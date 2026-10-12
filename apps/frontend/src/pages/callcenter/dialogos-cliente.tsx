import { useState } from 'react';
import { MapaPunto, type Coordenadas } from '@/components/MapaPunto';
import { Campo, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Checkbox, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import type { Cliente, ClienteDetalle, DireccionCliente } from '@/lib/dominio';

// ─── Cliente ──────────────────────────────────────────────────────────────────

function FormularioCliente({
  cliente,
  telefonoInicial,
  onListo,
  onCancelar,
}: {
  cliente?: Cliente;
  telefonoInicial?: string;
  onListo: (c: ClienteDetalle) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? telefonoInicial ?? '');
  const [nit, setNit] = useState(cliente?.nit ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [enviado, setEnviado] = useState(false);
  const errores = {
    nombre: nombre.trim().length < 3 ? 'Ingrese el nombre del cliente' : undefined,
    telefono: /^\d{8}$/.test(telefono.replace(/[\s-]/g, ''))
      ? undefined
      : 'El teléfono debe tener 8 dígitos',
  };
  const guardar = useMutacion(
    () => {
      const cuerpo = {
        nombre: nombre.trim(),
        telefono: telefono.replace(/[\s-]/g, ''),
        nit: nit.trim() || undefined,
        email: email.trim() || undefined,
      };
      return cliente
        ? api.patch<ClienteDetalle>(`/clientes/${cliente.id}`, cuerpo)
        : api.post<ClienteDetalle>('/clientes', cuerpo);
    },
    { invalidar: [['clientes']], exito: cliente ? 'Cliente actualizado' : 'Cliente registrado' },
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!errores.nombre && !errores.telefono) {
          guardar.mutate(undefined, { onSuccess: onListo });
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
          id="nombreCliente"
          etiqueta="Nombre"
          className="sm:col-span-2"
          error={enviado ? errores.nombre : undefined}
        >
          <Input
            id="nombreCliente"
            autoFocus
            aria-invalid={enviado && !!errores.nombre}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Campo>
        <Campo
          id="telefonoCliente"
          etiqueta="Teléfono"
          error={enviado ? errores.telefono : undefined}
        >
          <Input
            id="telefonoCliente"
            inputMode="tel"
            aria-invalid={enviado && !!errores.telefono}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </Campo>
        <Campo id="nitCliente" etiqueta="NIT" ayuda="Vacío si es consumidor final">
          <Input
            id="nitCliente"
            className="uppercase"
            value={nit}
            onChange={(e) => setNit(e.target.value)}
          />
        </Campo>
        <Campo id="emailCliente" etiqueta="Correo" className="sm:col-span-2">
          <Input
            id="emailCliente"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {cliente ? 'Guardar cambios' : 'Registrar cliente'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DialogoCliente({
  abierto,
  cliente,
  telefonoInicial,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  cliente?: Cliente;
  telefonoInicial?: string;
  onCerrar: () => void;
  onListo?: (c: ClienteDetalle) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent titulo={cliente ? 'Editar cliente' : 'Registrar cliente'}>
          <FormularioCliente
            cliente={cliente}
            telefonoInicial={telefonoInicial}
            onCancelar={onCerrar}
            onListo={(c) => {
              onListo?.(c);
              onCerrar();
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Dirección con mapa ───────────────────────────────────────────────────────

function FormularioDireccion({
  clienteId,
  direccion,
  onListo,
  onCancelar,
}: {
  clienteId: string;
  direccion?: DireccionCliente;
  onListo: (c: ClienteDetalle) => void;
  onCancelar: () => void;
}) {
  const [alias, setAlias] = useState(direccion?.alias ?? '');
  const [texto, setTexto] = useState(direccion?.direccion ?? '');
  const [referencia, setReferencia] = useState(direccion?.referencia ?? '');
  const [latitud, setLatitud] = useState(direccion?.latitud ?? '');
  const [longitud, setLongitud] = useState(direccion?.longitud ?? '');
  const [principal, setPrincipal] = useState(direccion?.principal ?? false);
  const [enviado, setEnviado] = useState(false);

  const lat = Number(latitud);
  const lng = Number(longitud);
  const coordenadasValidas =
    latitud !== '' && longitud !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const punto: Coordenadas | null = coordenadasValidas ? { latitud: lat, longitud: lng } : null;
  const errores = {
    direccion: texto.trim().length < 5 ? 'Ingrese la dirección' : undefined,
    coordenadas: coordenadasValidas
      ? undefined
      : 'Haga clic en el mapa para marcar el punto de entrega o escriba las coordenadas',
  };

  const guardar = useMutacion(
    () => {
      const cuerpo = {
        alias: alias.trim() || undefined,
        direccion: texto.trim(),
        referencia: referencia.trim() || undefined,
        latitud: lat,
        longitud: lng,
        principal,
      };
      return direccion
        ? api.patch<ClienteDetalle>(`/clientes/${clienteId}/direcciones/${direccion.id}`, cuerpo)
        : api.post<ClienteDetalle>(`/clientes/${clienteId}/direcciones`, cuerpo);
    },
    {
      invalidar: [['clientes']],
      exito: direccion ? 'Dirección actualizada' : 'Dirección agregada',
    },
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!errores.direccion && !errores.coordenadas) {
          guardar.mutate(undefined, { onSuccess: onListo });
        }
      }}
    >
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Campo id="alias" etiqueta="Alias" ayuda="Casa, trabajo...">
          <Input id="alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
        </Campo>
        <Campo id="direccion" etiqueta="Dirección" error={enviado ? errores.direccion : undefined}>
          <Input
            id="direccion"
            aria-invalid={enviado && !!errores.direccion}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Campo>
        <Campo id="referencia" etiqueta="Referencia" className="sm:col-span-2">
          <Input
            id="referencia"
            placeholder="Por ejemplo: portón negro frente al parque"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </Campo>
      </div>
      <div className="mt-4">
        <p className="m-0 mb-1.5 text-denso font-semibold">Punto de entrega</p>
        <MapaPunto
          valor={punto}
          onCambio={(c) => {
            setLatitud(String(c.latitud));
            setLongitud(String(c.longitud));
          }}
          className="h-64"
        />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Input
            aria-label="Latitud"
            placeholder="Latitud"
            inputMode="decimal"
            className="tabular-nums"
            value={latitud}
            onChange={(e) => setLatitud(e.target.value)}
          />
          <Input
            aria-label="Longitud"
            placeholder="Longitud"
            inputMode="decimal"
            className="tabular-nums"
            value={longitud}
            onChange={(e) => setLongitud(e.target.value)}
          />
        </div>
        {enviado && errores.coordenadas && (
          <p role="alert" className="m-0 mt-1 text-meta text-ladrillo">
            {errores.coordenadas}
          </p>
        )}
      </div>
      <label className="mt-4 flex items-center gap-2 text-denso">
        <Checkbox checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
        Dirección principal del cliente
      </label>
      <DialogFooter>
        <Button type="button" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          {direccion ? 'Guardar dirección' : 'Agregar dirección'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DialogoDireccion({
  abierto,
  clienteId,
  direccion,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  clienteId: string;
  direccion?: DireccionCliente;
  onCerrar: () => void;
  onListo?: (c: ClienteDetalle) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent
          titulo={direccion ? 'Editar dirección' : 'Agregar dirección'}
          descripcion="Las coordenadas sirven para calcular la sucursal más cercana y el tiempo de entrega."
          className="max-w-2xl"
        >
          <FormularioDireccion
            clienteId={clienteId}
            direccion={direccion}
            onCancelar={onCerrar}
            onListo={(c) => {
              onListo?.(c);
              onCerrar();
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
