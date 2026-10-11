import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const claseCampo =
  'h-10 w-full min-w-0 rounded-control border border-borde bg-superficie px-3 text-cuerpo text-texto placeholder:text-texto-secundario disabled:cursor-not-allowed disabled:bg-fondo disabled:opacity-70 aria-invalid:border-ladrillo';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(claseCampo, className)} {...props} />;
}

/** Select nativo: accesible, funciona bien en tablet y no necesita portal. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(claseCampo, 'pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(claseCampo, 'h-auto min-h-20 py-2', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('block text-denso font-semibold text-texto', className)} {...props} />
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 rounded-chip border-borde accent-verde-botica', className)}
      {...props}
    />
  );
}
