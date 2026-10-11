import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { usePuedeSolicitarTraslado } from '@/auth/permisos';
import { useUsuario } from '@/auth/sesion';
import { Campo, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { SelectorProducto, type ProductoElegido } from '@/components/SelectorProducto';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, type Pagina as PaginaApi } from '@/lib/api';
import { useCatalogo, useMutacion } from '@/lib/consultas';
import type { Perfil, StockGlobal, TrasladoDetalle, Ubicacion } from '@/lib/dominio';
import { cn } from '@/lib/utils';

/** Datos opcionales para precargar el formulario, por ejemplo desde las alertas de stock mínimo. */
export interface PrecargaTraslado {
  destinoId?: string;
  producto?: ProductoElegido;
  cantidad?: number;
}

const fila = z.object({
  producto: z
    .object({ id: z.string(), sku: z.string(), nombre: z.string(), presentacion: z.string() })
    .nullable()
    .refine((p) => p !== null, 'Seleccione el producto'),
  cantidad: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Unidades enteras')
    .refine((v) => Number(v) > 0, 'Mayor que cero'),
});

const esquemaPara = (usuario: Perfil) =>
  z
    .object({
      origenId: z.string().min(1, 'Seleccione el origen'),
      destinoId: z.string().min(1, 'Seleccione el destino'),
      observaciones: z.string().trim().max(500),
      detalles: z.array(fila).min(1, 'Agregue al menos un producto'),
    })
    .superRefine((d, ctx) => {
      if (d.origenId && d.origenId === d.destinoId) {
        ctx.addIssue({
          code: 'custom',
          path: ['destinoId'],
          message: 'El destino debe ser distinto del origen',
        });
      }
      const propia = usuario.ubicacion?.id;
      if (usuario.rol === 'GERENTE' && propia && d.origenId !== propia && d.destinoId !== propia) {
        ctx.addIssue({
          code: 'custom',
          path: ['destinoId'],
          message: `El traslado debe salir de ${usuario.ubicacion?.nombre} o llegar a ella`,
        });
      }
      const vistos = new Set<string>();
      d.detalles.forEach((f, i) => {
        if (f.producto && vistos.has(f.producto.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['detalles', i, 'producto'],
            message: 'Este producto ya está en otra fila; sume las cantidades',
          });
        }
        if (f.producto) {
          vistos.add(f.producto.id);
        }
      });
    });
type Esquema = ReturnType<typeof esquemaPara>;
type Datos = z.input<Esquema>;
type DatosValidos = z.output<Esquema>;

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? (
    <p role="alert" className="m-0 mt-1 text-meta text-ladrillo">
      {mensaje}
    </p>
  ) : null;
}

/** Existencia vigente del producto en el origen elegido, para pedir solo lo que hay. */
function VigenteEnOrigen({
  productoId,
  origenId,
  cantidad,
}: {
  productoId: string;
  origenId: string;
  cantidad: number;
}) {
  const consulta = useQuery({
    queryKey: ['inventario', 'stock-global', productoId],
    queryFn: () => api.get<StockGlobal>(`/inventario/productos/${productoId}/stock`),
  });
  if (!origenId) {
    return <span className="text-texto-secundario">Elija el origen</span>;
  }
  if (consulta.isPending) {
    return <span className="text-texto-secundario">...</span>;
  }
  const vigente = consulta.data?.ubicaciones.find((u) => u.ubicacion.id === origenId)?.vigente ?? 0;
  const falta = cantidad > vigente;
  return (
    <span className={cn('tabular-nums', falta ? 'font-semibold text-ladrillo' : 'text-texto')}>
      {vigente}
      {falta && <span className="block text-meta font-normal">No alcanza para despachar</span>}
    </span>
  );
}

export function NuevoTraslado() {
  const navegar = useNavigate();
  const usuario = useUsuario();
  const puedeSolicitar = usePuedeSolicitarTraslado();
  const precarga = (useLocation().state ?? {}) as PrecargaTraslado;
  const ubicaciones = useCatalogo<PaginaApi<Ubicacion>>(
    'ubicaciones',
    '/ubicaciones?limit=100&activa=true',
  );
  const bodega = ubicaciones.data?.data.find((u) => u.tipo === 'BODEGA_CENTRAL');
  const propia = usuario.rol === 'GERENTE' ? usuario.ubicacion : null;
  const propiaEsBodega = propia?.tipo === 'BODEGA_CENTRAL';

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Datos, unknown, DatosValidos>({
    resolver: zodResolver(esquemaPara(usuario)),
    // El gerente de una sucursal normalmente pide a la bodega; el de la bodega envía.
    values: {
      origenId: propiaEsBodega ? (propia?.id ?? '') : (bodega?.id ?? ''),
      destinoId: precarga.destinoId ?? (propia && !propiaEsBodega ? propia.id : ''),
      observaciones: '',
      detalles: [
        {
          producto: precarga.producto ?? null,
          cantidad: precarga.cantidad ? String(precarga.cantidad) : '',
        },
      ],
    },
    resetOptions: { keepDirtyValues: true },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'detalles' });
  const detalles = useWatch({ control, name: 'detalles' });
  const origenId = useWatch({ control, name: 'origenId' });

  const solicitar = useMutacion(
    (d: DatosValidos) =>
      api.post<TrasladoDetalle>('/traslados', {
        origenId: d.origenId,
        destinoId: d.destinoId,
        motivo: 'REABASTECIMIENTO',
        observaciones: d.observaciones || undefined,
        detalles: d.detalles.map((f) => ({
          productoId: f.producto.id,
          cantidad: Number(f.cantidad),
        })),
      }),
    {
      invalidar: [['traslados']],
      exito: (t) => `Traslado #${t.numero} solicitado`,
    },
  );

  if (!puedeSolicitar) {
    return (
      <Pagina>
        <h1 className="m-0 text-pagina font-semibold">Sin acceso</h1>
        <p className="mt-2 text-cuerpo text-texto-secundario">
          Solo los gerentes y el administrador solicitan traslados.
        </p>
      </Pagina>
    );
  }

  const opciones = ubicaciones.data?.data ?? [];
  return (
    <Pagina>
      <form
        onSubmit={handleSubmit((d) =>
          solicitar.mutate(d, { onSuccess: (t) => navegar(`/traslados/${t.id}`) }),
        )}
        noValidate
      >
        <EncabezadoPagina
          titulo="Solicitar traslado"
          descripcion="Los lotes se asignan automáticamente al despachar, empezando por el que vence primero."
          acciones={
            <>
              <Button asChild>
                <Link to="/traslados">Cancelar</Link>
              </Button>
              <Button type="submit" variant="primario" disabled={solicitar.isPending}>
                {solicitar.isPending ? 'Solicitando traslado...' : 'Solicitar traslado'}
              </Button>
            </>
          }
        />
        {solicitar.error && (
          <Panel className="mb-4 overflow-hidden">
            <PanelError error={solicitar.error} />
          </Panel>
        )}

        <Panel className="mb-6">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo
              id="origenId"
              etiqueta="Origen (envía)"
              ayuda="La bodega central o una sucursal con existencia"
              error={errors.origenId?.message}
            >
              <Select id="origenId" aria-invalid={!!errors.origenId} {...register('origenId')}>
                <option value="">Seleccione el origen</option>
                {opciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo
              id="destinoId"
              etiqueta="Destino (recibe)"
              ayuda="La bodega central no recibe traslados"
              error={errors.destinoId?.message}
            >
              <Select id="destinoId" aria-invalid={!!errors.destinoId} {...register('destinoId')}>
                <option value="">Seleccione el destino</option>
                {opciones
                  .filter((u) => u.tipo !== 'BODEGA_CENTRAL')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
              </Select>
            </Campo>
            <Campo id="observaciones" etiqueta="Observaciones" className="sm:col-span-2">
              <Textarea id="observaciones" className="min-h-12" {...register('observaciones')} />
            </Campo>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <h2 className="m-0 text-seccion font-semibold">Productos</h2>
            <Button type="button" onClick={() => append({ producto: null, cantidad: '' })}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Agregar producto
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-denso">
              <thead>
                <tr className="bg-fondo text-left text-texto-secundario">
                  <th className="px-4 py-2 font-semibold">Producto</th>
                  <th className="w-36 px-2 py-2 text-right font-semibold">Vigente en origen</th>
                  <th className="w-32 px-2 py-2 text-right font-semibold">Cantidad</th>
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((campo, i) => {
                  const e = errors.detalles?.[i];
                  const producto = detalles[i]?.producto;
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
                      <td className="px-2 py-2 pt-4 text-right">
                        {producto && (
                          <VigenteEnOrigen
                            productoId={producto.id}
                            origenId={origenId}
                            cantidad={Number(detalles[i]?.cantidad) || 0}
                          />
                        )}
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
