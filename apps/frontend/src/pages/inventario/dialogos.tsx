import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { EtiquetaLote } from '@/components/EtiquetaLote';
import { Campo, Cargando, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
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
import { TIPOS_UBICACION, type LoteExistencia, type StockGlobal } from '@/lib/dominio';
import { formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/utils';

// ─── Ajuste de inventario ─────────────────────────────────────────────────────

const esquemaAjuste = z.object({
  direccion: z.enum(['restar', 'sumar']),
  cantidad: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Ingrese un número entero de unidades')
    .refine((v) => Number(v) > 0, 'La cantidad debe ser mayor que cero'),
  motivo: z.string().trim().min(5, 'Explique el motivo del ajuste (mínimo 5 caracteres)').max(250),
});
type DatosAjuste = z.infer<typeof esquemaAjuste>;

function FormularioAjuste({
  lote,
  producto,
  onTerminar,
}: {
  lote: LoteExistencia;
  producto: string;
  onTerminar: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<DatosAjuste>({
    resolver: zodResolver(esquemaAjuste),
    defaultValues: { direccion: 'restar', cantidad: '', motivo: '' },
  });
  const direccion = useWatch({ control, name: 'direccion' });
  const cantidad = Number(useWatch({ control, name: 'cantidad' })) || 0;
  const resultado = direccion === 'restar' ? lote.cantidad - cantidad : lote.cantidad + cantidad;

  const ajustar = useMutacion(
    (d: DatosAjuste) =>
      api.post('/inventario/ajustes', {
        ubicacionId: lote.ubicacionId,
        loteId: lote.loteId,
        cantidad: d.direccion === 'restar' ? -Number(d.cantidad) : Number(d.cantidad),
        motivo: d.motivo,
      }),
    { invalidar: [['inventario']], exito: 'Ajuste registrado' },
  );

  const enviar = handleSubmit((d) => {
    if (d.direccion === 'restar' && Number(d.cantidad) > lote.cantidad) {
      setError('cantidad', {
        message: `El lote tiene ${lote.cantidad} unidades; no puede restar más`,
      });
      return;
    }
    ajustar.mutate(d, { onSuccess: onTerminar });
  });

  return (
    <form onSubmit={enviar} noValidate>
      {ajustar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={ajustar.error} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <EtiquetaLote
          numeroLote={lote.numeroLote}
          fechaVencimiento={lote.fechaVencimiento}
          vigencia={lote.vigencia}
          diasParaVencer={lote.diasParaVencer}
        />
        <div className="text-denso">
          <span className="block font-semibold">{producto}</span>
          <span className="text-texto-secundario">
            {lote.ubicacion} · {lote.cantidad} unidades
          </span>
        </div>
      </div>
      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-1.5 text-denso font-semibold">Tipo de ajuste</legend>
        <div className="flex gap-4 text-denso">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="restar"
              className="accent-verde-botica"
              {...register('direccion')}
            />
            Restar unidades
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="sumar"
              className="accent-verde-botica"
              {...register('direccion')}
            />
            Sumar unidades
          </label>
        </div>
      </fieldset>
      <div className="flex flex-col gap-4">
        <Campo
          id="cantidad"
          etiqueta="Cantidad"
          error={errors.cantidad?.message}
          ayuda={
            cantidad > 0 && resultado >= 0 ? `Quedarán ${resultado} unidades en el lote` : undefined
          }
        >
          <Input
            id="cantidad"
            inputMode="numeric"
            className="w-32 text-right tabular-nums"
            aria-invalid={!!errors.cantidad}
            {...register('cantidad')}
          />
        </Campo>
        <Campo
          id="motivo"
          etiqueta="Motivo"
          ayuda="Queda registrado en el kardex y en la bitácora"
          error={errors.motivo?.message}
        >
          <Textarea
            id="motivo"
            placeholder="Por ejemplo: conteo físico, 2 cajas dañadas por humedad"
            aria-invalid={!!errors.motivo}
            {...register('motivo')}
          />
        </Campo>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={ajustar.isPending}>
          Registrar ajuste
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DialogoAjuste({
  objetivo,
  onCerrar,
}: {
  objetivo: { lote: LoteExistencia; producto: string } | null;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={objetivo !== null} onOpenChange={(a) => !a && onCerrar()}>
      {objetivo && (
        <DialogContent
          titulo="Registrar ajuste"
          descripcion="Corrige la existencia de un lote con un movimiento de ajuste."
        >
          <FormularioAjuste
            lote={objetivo.lote}
            producto={objetivo.producto}
            onTerminar={onCerrar}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Stock mínimo ─────────────────────────────────────────────────────────────

const esquemaMinimo = z.object({
  cantidadMinima: z.string().trim().regex(/^\d+$/, 'Ingrese un número entero (0 para quitarlo)'),
});

function FormularioMinimo({
  ubicacionId,
  producto,
  actual,
  onTerminar,
}: {
  ubicacionId: string;
  producto: { id: string; nombre: string };
  actual: number | null;
  onTerminar: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof esquemaMinimo>>({
    resolver: zodResolver(esquemaMinimo),
    defaultValues: { cantidadMinima: actual !== null ? String(actual) : '' },
  });
  const guardar = useMutacion(
    (cantidadMinima: number) =>
      api.put('/inventario/stock-minimo', { ubicacionId, productoId: producto.id, cantidadMinima }),
    { invalidar: [['inventario']], exito: 'Stock mínimo guardado' },
  );
  return (
    <form
      onSubmit={handleSubmit((d) =>
        guardar.mutate(Number(d.cantidadMinima), { onSuccess: onTerminar }),
      )}
      noValidate
    >
      {guardar.error && (
        <div className="-mx-6 -mt-4 mb-4">
          <PanelError error={guardar.error} />
        </div>
      )}
      <p className="m-0 mb-4 text-denso">
        Cuando la existencia vigente de <strong>{producto.nombre}</strong> baje de este número, el
        sistema sugerirá un reabastecimiento.
      </p>
      <Campo
        id="cantidadMinima"
        etiqueta="Stock mínimo (unidades)"
        ayuda="Escriba 0 para quitar el stock mínimo"
        error={errors.cantidadMinima?.message}
      >
        <Input
          id="cantidadMinima"
          inputMode="numeric"
          className="w-32 text-right tabular-nums"
          aria-invalid={!!errors.cantidadMinima}
          {...register('cantidadMinima')}
        />
      </Campo>
      <DialogFooter>
        <Button type="button" onClick={onTerminar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primario" disabled={guardar.isPending}>
          Guardar stock mínimo
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DialogoStockMinimo({
  objetivo,
  onCerrar,
}: {
  objetivo: {
    ubicacionId: string;
    producto: { id: string; nombre: string };
    actual: number | null;
  } | null;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={objetivo !== null} onOpenChange={(a) => !a && onCerrar()}>
      {objetivo && (
        <DialogContent titulo="Stock mínimo">
          <FormularioMinimo {...objetivo} onTerminar={onCerrar} />
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Stock en todas las ubicaciones ───────────────────────────────────────────

function TablaStockGlobal({ productoId }: { productoId: string }) {
  const consulta = useQuery({
    queryKey: ['inventario', 'stock-global', productoId],
    queryFn: () => api.get<StockGlobal>(`/inventario/productos/${productoId}/stock`),
  });
  if (consulta.isPending) {
    return <Cargando />;
  }
  if (consulta.error) {
    return <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />;
  }
  const { ubicaciones, totalVigente } = consulta.data;
  return (
    <div className="-mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ubicación</TableHead>
            <TableHead numerico>Vigente</TableHead>
            <TableHead numerico>Por vencer</TableHead>
            <TableHead numerico>Vencido</TableHead>
            <TableHead>Próximo vencimiento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ubicaciones.map((u) => (
            <TableRow key={u.ubicacion.id}>
              <TableCell>
                <span className={cn(u.vigente > 0 && 'font-semibold')}>{u.ubicacion.nombre}</span>
                <span className="block text-meta text-texto-secundario">
                  {TIPOS_UBICACION[u.ubicacion.tipo]}
                </span>
              </TableCell>
              <TableCell numerico className={cn(u.vigente === 0 && 'text-texto-secundario')}>
                {u.vigente}
              </TableCell>
              <TableCell numerico className={cn(u.porVencer > 0 && 'text-ambar')}>
                {u.porVencer}
              </TableCell>
              <TableCell numerico className={cn(u.vencido > 0 && 'text-ladrillo')}>
                {u.vencido}
              </TableCell>
              <TableCell className="tabular-nums">
                {u.proximoVencimiento ? formatearFecha(u.proximoVencimiento) : ''}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-fondo hover:bg-fondo">
            <TableCell className="font-semibold">Total vigente</TableCell>
            <TableCell numerico className="font-semibold">
              {totalVigente}
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function DialogoStockGlobal({
  producto,
  onCerrar,
}: {
  producto: { id: string; nombre: string } | null;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={producto !== null} onOpenChange={(a) => !a && onCerrar()}>
      {producto && (
        <DialogContent
          titulo={producto.nombre}
          descripcion="Existencia en todas las ubicaciones activas."
          className="max-w-2xl"
        >
          <TablaStockGlobal productoId={producto.id} />
        </DialogContent>
      )}
    </Dialog>
  );
}
