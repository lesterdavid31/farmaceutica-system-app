import { X } from 'lucide-react';
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const claseCapa = 'fixed inset-0 z-50 bg-texto/40';
const claseContenido =
  'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel border border-borde bg-superficie shadow-flotante';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  titulo,
  descripcion,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { titulo: string; descripcion?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={claseCapa} />
      <DialogPrimitive.Content
        className={cn(claseContenido, className)}
        {...(!descripcion && { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borde px-6 py-4">
          <div>
            <DialogPrimitive.Title className="m-0 text-seccion font-semibold">
              {titulo}
            </DialogPrimitive.Title>
            {descripcion && (
              <DialogPrimitive.Description className="m-0 mt-1 text-denso text-texto-secundario">
                {descripcion}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-control p-1 text-texto-secundario hover:bg-fondo"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Pie de un formulario dentro de un modal: acciones alineadas a la derecha. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>;
}

/** Confirmación antes de acciones irreversibles (sección 8). */
export function ConfirmDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  destructivo = false,
  pendiente = false,
  onConfirmar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion: ReactNode;
  textoConfirmar: string;
  destructivo?: boolean;
  pendiente?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <AlertPrimitive.Root open={abierto} onOpenChange={onAbiertoChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={claseCapa} />
        <AlertPrimitive.Content className={cn(claseContenido, 'max-w-md p-6')}>
          <AlertPrimitive.Title className="m-0 text-seccion font-semibold">
            {titulo}
          </AlertPrimitive.Title>
          <AlertPrimitive.Description className="m-0 mt-2 text-cuerpo text-texto-secundario">
            {descripcion}
          </AlertPrimitive.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertPrimitive.Cancel className="inline-flex h-10 items-center rounded-control border border-borde bg-superficie px-4 text-denso font-semibold hover:bg-fondo">
              Cancelar
            </AlertPrimitive.Cancel>
            <button
              type="button"
              disabled={pendiente}
              onClick={onConfirmar}
              className={cn(
                'inline-flex h-10 items-center rounded-control px-4 text-denso font-semibold text-white disabled:opacity-60',
                destructivo
                  ? 'bg-ladrillo hover:brightness-95'
                  : 'bg-verde-botica hover:bg-verde-botica-oscuro',
              )}
            >
              {textoConfirmar}
            </button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
