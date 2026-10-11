import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Contenedor de página: alineado a la izquierda, ancho máximo de 1440 px. */
export function Pagina({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8">{children}</div>;
}

/** Título a la izquierda y acciones (botón primario) a la derecha, en la misma fila. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="m-0 text-pagina font-semibold">{titulo}</h1>
        {descripcion && <p className="m-0 mt-1 text-denso text-texto-secundario">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-panel border border-borde bg-superficie', className)}>
      {children}
    </section>
  );
}

/** Fila de filtros encima de una tabla. */
export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">{children}</div>;
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <p role="status" className="m-0 px-4 py-8 text-center text-denso text-texto-secundario">
      {texto}
    </p>
  );
}

/** Estado vacío: un texto breve que dice qué hacer y el botón para hacerlo. */
export function EstadoVacio({ texto, accion }: { texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="m-0 text-cuerpo text-texto-secundario">{texto}</p>
      {accion}
    </div>
  );
}

export function mensajeDeError(error: unknown) {
  if (error instanceof ErrorApi) {
    return error.message;
  }
  return 'Ocurrió un error inesperado. Intente de nuevo.';
}

export function PanelError({ error, onReintentar }: { error: unknown; onReintentar?: () => void }) {
  const detalles = error instanceof ErrorApi ? error.listaDetalles : [];
  return (
    <div role="alert" className="flex flex-col items-start gap-3 bg-ladrillo-fondo px-4 py-4">
      <div className="flex items-start gap-2 text-ladrillo">
        <AlertCircle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="m-0 text-denso font-semibold">{mensajeDeError(error)}</p>
          {detalles.length > 0 && (
            <ul className="m-0 mt-1 pl-5 text-denso">
              {detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {onReintentar && (
        <Button size="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Paginacion({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / limit));
  const desde = total === 0 ? 0 : (page - 1) * limit + 1;
  const hasta = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-4 py-3 text-denso text-texto-secundario">
      <span className="tabular-nums">
        {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Anterior
        </Button>
        <span className="tabular-nums">
          Página {page} de {paginas}
        </span>
        <Button
          size="sm"
          disabled={page >= paginas}
          onClick={() => onPage(page + 1)}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Campo de formulario: etiqueta arriba, ayuda en gris y error en ladrillo debajo. */
export function Campo({
  id,
  etiqueta,
  ayuda,
  error,
  className,
  children,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && !error && (
        <p id={`${id}-ayuda`} className="m-0 text-meta text-texto-secundario">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-meta text-ladrillo">
          {error}
        </p>
      )}
    </div>
  );
}
