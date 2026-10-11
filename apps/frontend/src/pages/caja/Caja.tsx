import { ArrowDownUp, Lock, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useUsuario } from '@/auth/sesion';
import { Campo, Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import { formatearFechaHora } from '@/lib/formato';
import { useTurnoActual } from './turno-actual';
import { DialogoCierre, DialogoMovimiento, ResumenTurno, TablaMovimientos } from './componentes';

export function AbrirCaja() {
  const usuario = useUsuario();
  const [monto, setMonto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviado, setEnviado] = useState(false);
  const error = /^\d+(\.\d{1,2})?$/.test(monto.trim())
    ? undefined
    : 'Ingrese el efectivo inicial con máximo 2 decimales (puede ser 0)';
  const abrir = useMutacion(
    () =>
      api.post('/caja/turnos', {
        montoInicial: Number(monto),
        observaciones: observaciones.trim() || undefined,
      }),
    { invalidar: [['caja']], exito: 'Caja abierta' },
  );
  return (
    <Panel className="max-w-lg">
      <form
        noValidate
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setEnviado(true);
          if (!error) {
            abrir.mutate(undefined);
          }
        }}
      >
        <div>
          <h2 className="m-0 text-seccion font-semibold">Abrir caja</h2>
          <p className="m-0 mt-1 text-denso text-texto-secundario">
            Necesita un turno abierto en {usuario.ubicacion?.nombre} para vender. Cuente el efectivo
            con el que inicia la gaveta.
          </p>
        </div>
        {abrir.error && <PanelError error={abrir.error} />}
        <Campo id="montoInicial" etiqueta="Monto inicial (Q)" error={enviado ? error : undefined}>
          <Input
            id="montoInicial"
            inputMode="decimal"
            autoFocus
            className="h-12 w-44 text-right text-cuerpo tabular-nums"
            aria-invalid={enviado && !!error}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </Campo>
        <Campo id="observacionesApertura" etiqueta="Observaciones">
          <Textarea
            id="observacionesApertura"
            className="min-h-12"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </Campo>
        <div>
          <Button type="submit" variant="primario" size="lg" disabled={abrir.isPending}>
            Abrir caja
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function Caja() {
  const consulta = useTurnoActual();
  const [dialogo, setDialogo] = useState<'movimiento' | 'cierre' | null>(null);
  const turno = consulta.data;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Caja"
        descripcion={
          turno
            ? `Turno abierto el ${formatearFechaHora(turno.apertura)} en ${turno.ubicacion.nombre}`
            : 'Turno de caja del cajero: apertura, movimientos de efectivo y cierre con arqueo.'
        }
        acciones={
          turno && (
            <>
              <Button asChild>
                <Link to="/punto-de-venta">
                  <ShoppingCart size={16} strokeWidth={1.75} aria-hidden="true" />
                  Ir al punto de venta
                </Link>
              </Button>
              <Button onClick={() => setDialogo('movimiento')}>
                <ArrowDownUp size={16} strokeWidth={1.75} aria-hidden="true" />
                Registrar movimiento
              </Button>
              <Button variant="primario" onClick={() => setDialogo('cierre')}>
                <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
                Cerrar caja
              </Button>
            </>
          )
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
      ) : !turno ? (
        <>
          <AbrirCaja />
          <p className="mt-4 text-denso text-texto-secundario">
            Sus turnos anteriores están en{' '}
            <Link to="/caja/turnos" className="text-verde-botica">
              Turnos de caja
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <Panel className="mb-6">
            <ResumenTurno turno={turno} />
          </Panel>
          <Panel>
            <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
              Movimientos del turno
            </h2>
            <TablaMovimientos movimientos={turno.movimientos} />
          </Panel>
          <DialogoMovimiento
            turno={turno}
            abierto={dialogo === 'movimiento'}
            onCerrar={() => setDialogo(null)}
          />
          <DialogoCierre
            turno={turno}
            abierto={dialogo === 'cierre'}
            onCerrar={() => setDialogo(null)}
          />
        </>
      )}
    </Pagina>
  );
}
