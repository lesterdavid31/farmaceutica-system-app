import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Campo, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { SelectorProducto } from '@/components/SelectorProducto';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, type Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useMutacion } from '@/lib/consultas';
import type { CompraDetalle, Proveedor } from '@/lib/dominio';
import { formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { usePuedeComprar } from '@/auth/permisos';

/** Fecha de hoy en la zona horaria del navegador, en formato aaaa-mm-dd. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fila = z.object({
  producto: z
    .object({ id: z.string(), sku: z.string(), nombre: z.string(), presentacion: z.string() })
    .nullable()
    .refine((p) => p !== null, 'Seleccione el producto'),
  numeroLote: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9./-]{0,39}$/, 'Ingrese el número de lote impreso en la caja'),
  fechaVencimiento: z
    .string()
    .min(1, 'Ingrese el vencimiento')
    .refine((f) => f > hoyLocal(), 'El lote ya está vencido o vence hoy'),
  cantidad: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Unidades enteras')
    .refine((v) => Number(v) > 0, 'Mayor que cero'),
  costoUnitario: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Monto con máximo 2 decimales')
    .refine((v) => Number(v) > 0, 'Mayor que cero'),
});

const esquema = z
  .object({
    proveedorId: z.string().min(1, 'Seleccione el proveedor'),
    numeroDocumento: z.string().trim().max(40),
    fecha: z
      .string()
      .min(1, 'Ingrese la fecha')
      .refine((f) => f <= hoyLocal(), 'La fecha no puede ser futura'),
    observaciones: z.string().trim().max(500),
    detalles: z.array(fila).min(1, 'Agregue al menos un producto'),
  })
  .superRefine((d, ctx) => {
    const vistos = new Set<string>();
    d.detalles.forEach((f, i) => {
      const clave = `${f.producto?.id}|${f.numeroLote.trim().toUpperCase()}`;
      if (f.producto && f.numeroLote && vistos.has(clave)) {
        ctx.addIssue({
          code: 'custom',
          path: ['detalles', i, 'numeroLote'],
          message: 'Este lote ya está en otra fila; sume las cantidades',
        });
      }
      vistos.add(clave);
    });
  });
/** Valores del formulario (producto puede ser null) y datos ya validados (producto elegido). */
type Datos = z.input<typeof esquema>;
type DatosValidos = z.output<typeof esquema>;

const filaVacia = (): Datos['detalles'][number] => ({
  producto: null,
  numeroLote: '',
  fechaVencimiento: '',
  cantidad: '',
  costoUnitario: '',
});

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? (
    <p role="alert" className="m-0 mt-1 text-meta text-ladrillo">
      {mensaje}
    </p>
  ) : null;
}

export function NuevaCompra() {
  const navegar = useNavigate();
  const puedeComprar = usePuedeComprar();
  const proveedores = useCatalogo<PaginaApi<Proveedor>>(
    'proveedores',
    '/proveedores?limit=100&activo=true',
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Datos, unknown, DatosValidos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      proveedorId: '',
      numeroDocumento: '',
      fecha: hoyLocal(),
      observaciones: '',
      detalles: [filaVacia()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'detalles' });
  const detalles = useWatch({ control, name: 'detalles' });
  const total = detalles.reduce(
    (s, d) => s + (Number(d.cantidad) || 0) * (Number(d.costoUnitario) || 0),
    0,
  );

  const registrar = useMutacion(
    (d: DatosValidos) =>
      api.post<CompraDetalle>('/compras', {
        proveedorId: d.proveedorId,
        numeroDocumento: d.numeroDocumento || undefined,
        fecha: d.fecha,
        observaciones: d.observaciones || undefined,
        detalles: d.detalles.map((f) => ({
          productoId: f.producto.id,
          numeroLote: f.numeroLote,
          fechaVencimiento: f.fechaVencimiento,
          cantidad: Number(f.cantidad),
          costoUnitario: Number(f.costoUnitario),
        })),
      }),
    { invalidar: [['compras'], ['inventario']], exito: 'Compra registrada' },
  );

  if (!puedeComprar) {
    return (
      <Pagina>
        <h1 className="m-0 text-pagina font-semibold">Sin acceso</h1>
        <p className="mt-2 text-cuerpo text-texto-secundario">
          Solo la bodega central registra compras. Las sucursales se abastecen con traslados.
        </p>
      </Pagina>
    );
  }

  return (
    <Pagina>
      <form
        onSubmit={handleSubmit((d) =>
          registrar.mutate(d, { onSuccess: (compra) => navegar(`/compras/${compra.id}`) }),
        )}
        noValidate
      >
        <EncabezadoPagina
          titulo="Registrar compra"
          descripcion="Ingresa a la bodega central. Cada fila es un lote con su vencimiento y costo."
          acciones={
            <>
              <Button asChild>
                <Link to="/compras">Cancelar</Link>
              </Button>
              <Button type="submit" variant="primario" disabled={registrar.isPending}>
                {registrar.isPending ? 'Registrando compra...' : 'Registrar compra'}
              </Button>
            </>
          }
        />
        {registrar.error && (
          <Panel className="mb-4 overflow-hidden">
            <PanelError error={registrar.error} />
          </Panel>
        )}

        <Panel className="mb-6">
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Campo id="proveedorId" etiqueta="Proveedor" error={errors.proveedorId?.message}>
              <Select
                id="proveedorId"
                aria-invalid={!!errors.proveedorId}
                {...register('proveedorId')}
              >
                <option value="">Seleccione el proveedor</option>
                {proveedores.data?.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo
              id="numeroDocumento"
              etiqueta="Factura del proveedor"
              error={errors.numeroDocumento?.message}
            >
              <Input id="numeroDocumento" {...register('numeroDocumento')} />
            </Campo>
            <Campo id="fecha" etiqueta="Fecha de la compra" error={errors.fecha?.message}>
              <Input id="fecha" type="date" aria-invalid={!!errors.fecha} {...register('fecha')} />
            </Campo>
            <Campo id="observaciones" etiqueta="Observaciones" className="sm:col-span-3">
              <Textarea id="observaciones" className="min-h-12" {...register('observaciones')} />
            </Campo>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <h2 className="m-0 text-seccion font-semibold">Productos</h2>
            <Button type="button" onClick={() => append(filaVacia())}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Agregar producto
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-denso">
              <thead>
                <tr className="bg-fondo text-left text-texto-secundario">
                  <th className="px-4 py-2 font-semibold">Producto</th>
                  <th className="w-40 px-2 py-2 font-semibold">Número de lote</th>
                  <th className="w-40 px-2 py-2 font-semibold">Vencimiento</th>
                  <th className="w-28 px-2 py-2 text-right font-semibold">Cantidad</th>
                  <th className="w-32 px-2 py-2 text-right font-semibold">Costo unitario</th>
                  <th className="w-32 px-2 py-2 text-right font-semibold">Subtotal</th>
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((campo, i) => {
                  const e = errors.detalles?.[i];
                  const subtotal =
                    (Number(detalles[i]?.cantidad) || 0) *
                    (Number(detalles[i]?.costoUnitario) || 0);
                  return (
                    <tr key={campo.id} className="border-b border-borde align-top last:border-b-0">
                      <td className="px-4 py-2">
                        <Controller
                          control={control}
                          name={`detalles.${i}.producto`}
                          render={({ field }) => (
                            <SelectorProducto
                              valor={field.value}
                              onCambio={field.onChange}
                              invalido={!!e?.producto}
                            />
                          )}
                        />
                        <ErrorCampo mensaje={e?.producto?.message} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          aria-label={`Número de lote, fila ${i + 1}`}
                          aria-invalid={!!e?.numeroLote}
                          className="uppercase"
                          {...register(`detalles.${i}.numeroLote`)}
                        />
                        <ErrorCampo mensaje={e?.numeroLote?.message} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="date"
                          aria-label={`Vencimiento, fila ${i + 1}`}
                          aria-invalid={!!e?.fechaVencimiento}
                          {...register(`detalles.${i}.fechaVencimiento`)}
                        />
                        <ErrorCampo mensaje={e?.fechaVencimiento?.message} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          inputMode="numeric"
                          aria-label={`Cantidad, fila ${i + 1}`}
                          aria-invalid={!!e?.cantidad}
                          className="text-right tabular-nums"
                          {...register(`detalles.${i}.cantidad`)}
                        />
                        <ErrorCampo mensaje={e?.cantidad?.message} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          inputMode="decimal"
                          aria-label={`Costo unitario, fila ${i + 1}`}
                          aria-invalid={!!e?.costoUnitario}
                          className="text-right tabular-nums"
                          {...register(`detalles.${i}.costoUnitario`)}
                        />
                        <ErrorCampo mensaje={e?.costoUnitario?.message} />
                      </td>
                      <td className="cifras px-2 py-2 pt-4 whitespace-nowrap">
                        {formatearMoneda(subtotal)}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          size="icono"
                          variant="terciario"
                          aria-label={`Quitar fila ${i + 1}`}
                          disabled={fields.length === 1}
                          onClick={() => remove(i)}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-fondo">
                  <td colSpan={5} className="px-4 py-3 text-right font-semibold">
                    Total de la compra
                  </td>
                  <td
                    className={cn('cifras px-2 py-3 text-seccion font-semibold whitespace-nowrap')}
                  >
                    {formatearMoneda(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {errors.detalles?.root?.message && (
            <p className="m-0 px-4 py-2 text-meta text-ladrillo">{errors.detalles.root.message}</p>
          )}
        </Panel>
      </form>
    </Pagina>
  );
}
