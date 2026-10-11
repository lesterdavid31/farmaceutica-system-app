import { Toaster as Sonner } from 'sonner';

/** Toasts en la esquina inferior derecha, con los colores de estado como texto sobre fondo claro. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[356px] items-start gap-2 rounded-panel border border-borde bg-superficie p-4 text-denso text-texto shadow-flotante',
          title: 'font-semibold',
          description: 'text-texto-secundario',
          success: '[&_[data-icon]]:text-verde-botica',
          error: 'bg-ladrillo-fondo text-ladrillo',
          closeButton: 'order-last ml-auto text-texto-secundario',
        },
      }}
    />
  );
}
