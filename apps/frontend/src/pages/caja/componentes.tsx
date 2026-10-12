import { useState, type ReactNode } from 'react';
import { BadgeEstado } from '@/components/BadgeEstado';
import { Campo, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import {
  METODOS_PAGO,
  TIPOS_MOVIMIENTO_CAJA,
  type MovimientoCaja,
  type TurnoCajaDetalle,
} from '@/lib/dominio';
import { formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

const INVALIDAR = [['caja'], ['ventas']];
const MONTO = /^\d+(\.\d{1,2})?$/;

/** Sobrante, faltante o cuadrado, con el color semántico de la sección 8.1. */
export function BadgeDiferencia({ diferencia }: { diferencia: string | number | null }) {
  if (diferencia === null) {
    return <BadgeEstado tono="proceso">Abierto</BadgeEstado>;
  }
  const valor = Number(diferencia);
  if (valor === 0) {
    return <BadgeEstado tono="correcto">Cuadrado</BadgeEstado>;
  }
  return valor < 0 ? (
    <BadgeEstado tono="peligro">Faltante {formatearMoneda(Math.abs(valor))}</BadgeEstado>
  ) : (
    <BadgeEstado tono="advertencia">Sobrante {formatearMoneda(valor)}</BadgeEstado>
  );
}

function Indicador({
  etiqueta,
  valor,
  detalle,
  destacado,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  destacado?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-meta text-texto-secundario">{etiqueta}</span>
      <span
        className={cn('tabular-nums font-semibold', destacado ? 'text-seccion' : 'text-cuerpo')}
      >
        {valor}
      </span>
      {detalle && <span className="text-meta text-texto-secundario">{detalle}</span>}
    </div>
  );
}

/** Franja de indicadores del turno en un solo panel con separadores (sección 8). */
export function ResumenTurno({ turno }: { turno: TurnoCajaDetalle }) {
  const { resumen } = turno;
  const efectivo = resumen.efectivoPorTipo;
  const ventasEfectivo = Number(efectivo.VENTA) + Number(efectivo.ANULACION);
  const cobrosPedidos = Number(efectivo.COBRO_CONTRA_ENTREGA);
  const cerrado = turno.estado === 'CERRADO';
  return (
    <div className="grid grid-cols-2 divide-borde sm:grid-cols-4 sm:divide-x xl:grid-cols-7">
      <Indicador etiqueta="Monto inicial" valor={formatearMoneda(resumen.montoInicial)} />
      <Indicador
        etiqueta="Ventas en efectivo"
        valor={formatearMoneda(ventasEfectivo)}
        detalle={
          Number(efectivo.ANULACION) !== 0 &&
          `incluye anulaciones por ${formatearMoneda(Math.abs(Number(efectivo.ANULACION)))}`
        }
      />
      <Indicador
        etiqueta="Cobros de pedidos"
        valor={formatearMoneda(cobrosPedidos)}
        detalle="Contra entrega, en efectivo"
      />
      <Indicador
        etiqueta="Ventas con tarjeta"
        valor={formatearMoneda(resumen.porMetodo.TARJETA)}
        detalle="Incluye pedidos; no entra al arqueo"
      />
      <Indicador
        etiqueta="Depósitos"
        valor={formatearMoneda(efectivo.DEPOSITO)}
        detalle={`Gastos ${formatearMoneda(Math.abs(Number(efectivo.GASTO)))} · Retiros ${formatearMoneda(Math.abs(Number(efectivo.RETIRO)))}`}
      />
      <Indicador
        etiqueta="Efectivo esperado"
        valor={formatearMoneda(cerrado ? turno.efectivoEsperado! : resumen.efectivoEsperado)}
        destacado
      />
      {cerrado ? (
        <Indicador
          etiqueta="Efectivo contado"
          valor={formatearMoneda(turno.efectivoContado!)}
          detalle={<BadgeDiferencia diferencia={turno.diferencia} />}
          destacado
        />
      ) : (
        <Indicador
          etiqueta="Ventas del turno"
          valor={turno.ventas.reduce((s, v) => s + v.cantidad, 0)}
          detalle={
            turno.ventas.some((v) => v.estado === 'ANULADA') &&
            `${turno.ventas.find((v) => v.estado === 'ANULADA')?.cantidad} anuladas`
          }
        />
      )}
    </div>
  );
}

export function TablaMovimientos({ movimientos }: { movimientos: MovimientoCaja[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="m-0 px-4 py-6 text-denso text-texto-secundario">
        Aún no hay movimientos en este turno.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hora</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Método</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead numerico>Monto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...movimientos].reverse().map((m) => {
          const monto = Number(m.monto);
          return (
            <TableRow key={m.id}>
              <TableCell className="tabular-nums whitespace-nowrap">
                {formatearFechaHora(m.createdAt)}
              </TableCell>
              <TableCell>{TIPOS_MOVIMIENTO_CAJA[m.tipo]}</TableCell>
              <TableCell>{METODOS_PAGO[m.metodoPago]}</TableCell>
              <TableCell className="min-w-48">
                {m.descripcion}
                <span className="block text-meta text-texto-secundario">{m.usuario.nombre}</span>
              </TableCell>
              <TableCell
                numerico
                className={cn(
                  'whitespace-nowrap',
                  monto < 0 ? 'text-ladrillo' : 'text-verde-botica',
                )}
              >
                {monto < 0 ? '−' : '+'}
                {formatearMoneda(Math.abs(monto))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Movimiento manual ────────────────────────────────────────────────────────

export function DialogoMovimiento({
  turno,
  abierto,
  onCerrar,
}: {
  turno: TurnoCajaDetalle;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent
          titulo="Registrar movimiento de caja"
          descripcion="Gastos menores y retiros sacan efectivo de la gaveta; los depósitos lo agregan."
        >
          <FormularioMovimiento turno={turno} onTerminar={onCerrar} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function FormularioMovimiento({
  turno,
  onTerminar,
}: {
  turno: TurnoCajaDetalle;
  onTerminar: () => void;
}) {
  const [tipo, setTipo] = useState<'GASTO' | 'RETIRO' | 'DEPOSITO'>('GASTO');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviado, setEnviado] = useState(false);
  const disponible = Number(turno.resumen.efectivoEsperado);
  const errorMonto = !MONTO.test(monto.trim())
    ? 'Ingrese un monto con máximo 2 decimales'
    : Number(monto) <= 0
      ? 'El monto debe ser mayor que cero'
      : tipo !== 'DEPOSITO' && Number(monto) > disponible
        ? `En la caja hay ${formatearMoneda(disponible)} en efectivo`
        : undefined;
  const errorDescripcion =
    descripcion.trim().length < 3 ? 'Describa el movimiento (mínimo 3 caracteres)' : undefined;

  const registrar = useMutacion(
    () =>
      api.post(`/caja/turnos/${turno.id}/movimientos`, {
        tipo,
        monto: Number(monto),
        descripcion: descripcion.trim(),
      }),
    {
      invalidar: INVALIDAR,
      exito: `${tipo === 'GASTO' ? 'Gasto' : tipo === 'RETIRO' ? 'Retiro' : 'Depósito'} registrado`,
    },
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!errorMonto && !errorDescripcion) {
          registrar.mutate(undefined, { onSuccess: onTerminar });
        }
      }}
    >
      {registrar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={registrar.error} />
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Campo id="tipoMovimiento" etiqueta="Tipo">
          <Select
            id="tipoMovimiento"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="GASTO">Gasto menor (sale efectivo)</option>
            <option value="RETIRO">Retiro (sale efectivo)</option>
            <option value="DEPOSITO">Depósito (entra efectivo)</option>
          </Select>
        </Campo>
        <Campo
          id="montoMovimiento"
          etiqueta="Monto (Q)"
          ayuda={`Efectivo en caja: ${formatearMoneda(disponible)}`}
          error={enviado ? errorMonto : undefined}
        >
          <Input
            id="montoMovimiento"
            inputMode="decimal"
            className="w-40 text-right tabular-nums"
            aria-invalid={enviado && !!errorMonto}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </Campo>
        <Campo
          id="descripcionMovimiento"
          etiqueta="Descripción"
          error={enviado ? errorDescripcion : undefined}
        >
          <Textarea
            id="descripcionMovimiento"
            placeholder="Por ejemplo: compra de bolsas plásticas"
            aria-invalid={enviado && !!errorDescripcion}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={registrar.isPending}>
          Registrar movimiento
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Cierre con arqueo ────────────────────────────────────────────────────────

export function DialogoCierre({
  turno,
  abierto,
  onCerrar,
}: {
  turno: TurnoCajaDetalle;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      {abierto && (
        <DialogContent
          titulo="Cerrar caja"
          descripcion="Cuente el efectivo de la gaveta e ingrese el total. No incluya los vouchers de tarjeta."
        >
          <FormularioCierre turno={turno} onTerminar={onCerrar} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function FormularioCierre({
  turno,
  onTerminar,
}: {
  turno: TurnoCajaDetalle;
  onTerminar: () => void;
}) {
  const [contado, setContado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const esperado = Number(turno.resumen.efectivoEsperado);
  const valido = MONTO.test(contado.trim());
  const diferencia = valido ? Math.round((Number(contado) - esperado) * 100) / 100 : null;
  const error = valido ? undefined : 'Ingrese el efectivo contado, con máximo 2 decimales';

  const cerrar = useMutacion(
    () =>
      api.post(`/caja/turnos/${turno.id}/cerrar`, {
        efectivoContado: Number(contado),
        observaciones: observaciones.trim() || undefined,
      }),
    { invalidar: INVALIDAR, exito: 'Caja cerrada', errorEnToast: true },
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (!error) {
          setConfirmar(true);
        }
      }}
    >
      <dl className="m-0 mb-4 grid grid-cols-2 gap-3 text-denso">
        <div>
          <dt className="text-texto-secundario">Efectivo esperado</dt>
          <dd className="m-0 text-seccion font-semibold tabular-nums">
            {formatearMoneda(esperado)}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Diferencia</dt>
          <dd className="m-0 mt-1">
            {diferencia === null ? (
              <span className="text-texto-secundario">—</span>
            ) : (
              <BadgeDiferencia diferencia={diferencia} />
            )}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-4">
        <Campo
          id="efectivoContado"
          etiqueta="Efectivo contado (Q)"
          error={enviado ? error : undefined}
        >
          <Input
            id="efectivoContado"
            inputMode="decimal"
            autoFocus
            className="w-44 text-right tabular-nums"
            aria-invalid={enviado && !!error}
            value={contado}
            onChange={(e) => setContado(e.target.value)}
          />
        </Campo>
        <Campo
          id="observacionesCierre"
          etiqueta="Observaciones"
          ayuda={diferencia ? 'Explique la diferencia; queda registrada con el arqueo' : undefined}
        >
          <Textarea
            id="observacionesCierre"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario">
          Cerrar caja
        </Button>
      </DialogFooter>
      <ConfirmDialog
        abierto={confirmar}
        onAbiertoChange={setConfirmar}
        titulo="¿Cerrar la caja?"
        descripcion={`Se registrará un efectivo contado de ${formatearMoneda(Number(contado) || 0)}${
          diferencia
            ? ` con ${diferencia < 0 ? 'faltante' : 'sobrante'} de ${formatearMoneda(Math.abs(diferencia))}`
            : ', sin diferencias'
        }. Después del cierre no se pueden registrar ventas ni anular las de este turno.`}
        textoConfirmar="Cerrar caja"
        pendiente={cerrar.isPending}
        onConfirmar={() =>
          cerrar.mutate(undefined, {
            onSuccess: () => {
              setConfirmar(false);
              onTerminar();
            },
            onError: () => setConfirmar(false),
          })
        }
      />
    </form>
  );
}
