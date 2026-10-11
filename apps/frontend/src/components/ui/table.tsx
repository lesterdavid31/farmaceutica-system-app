import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Tablas: el componente principal del sistema (sección 8.1). */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-denso', className)} {...props} />
    </div>
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'h-11 border-b border-borde transition-colors duration-150 last:border-b-0 hover:bg-salvia/50',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  numerico,
  ...props
}: ComponentProps<'th'> & { numerico?: boolean }) {
  return (
    <th
      className={cn(
        'h-10 border-b border-borde bg-fondo px-4 text-left font-semibold whitespace-nowrap text-texto-secundario',
        numerico && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numerico,
  ...props
}: ComponentProps<'td'> & { numerico?: boolean }) {
  return (
    <td className={cn('px-4 py-2 align-middle', numerico && 'cifras', className)} {...props} />
  );
}
