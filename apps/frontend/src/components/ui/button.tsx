import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-denso font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Un solo botón primario por pantalla o modal. */
        primario:
          'bg-verde-botica text-white hover:bg-verde-botica-oscuro active:bg-verde-botica-oscuro',
        secundario: 'border border-borde bg-superficie text-texto hover:bg-fondo',
        /** Solo para acciones destructivas (anular, dar de baja). */
        destructivo: 'bg-ladrillo text-white hover:brightness-95',
        terciario: 'text-verde-botica hover:bg-salvia',
      },
      size: {
        md: 'h-10 px-4',
        sm: 'h-8 px-3 text-meta',
        lg: 'h-12 px-5 text-cuerpo',
        icono: 'size-10',
      },
    },
    defaultVariants: { variant: 'secundario', size: 'md' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Componente = asChild ? Slot.Root : 'button';
  return <Componente className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
