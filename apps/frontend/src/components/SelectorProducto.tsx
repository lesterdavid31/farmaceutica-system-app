import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { claseCampo } from '@/components/ui/input';
import { api, query, type Pagina } from '@/lib/api';
import { useDebounce } from '@/lib/consultas';
import type { Producto } from '@/lib/dominio';
import { cn } from '@/lib/utils';

export type ProductoElegido = Pick<Producto, 'id' | 'sku' | 'nombre' | 'presentacion'>;

/** Combobox de productos activos: busca por nombre, SKU o principio activo. */
export function SelectorProducto({
  id,
  valor,
  onCambio,
  placeholder = 'Buscar por nombre, SKU o principio activo',
  invalido,
  className,
}: {
  id?: string;
  valor: ProductoElegido | null;
  onCambio: (producto: ProductoElegido | null) => void;
  placeholder?: string;
  invalido?: boolean;
  className?: string;
}) {
  const idLista = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const busqueda = useDebounce(texto.trim(), 250);

  const resultados = useQuery({
    queryKey: ['productos', 'selector', busqueda],
    queryFn: () =>
      api.get<Pagina<Producto>>(`/productos${query({ q: busqueda, activo: true, limit: 8 })}`),
    enabled: abierto && busqueda.length >= 2,
    staleTime: 60_000,
  });
  const opciones = resultados.data?.data ?? [];

  const elegir = (p: Producto) => {
    onCambio({ id: p.id, sku: p.sku, nombre: p.nombre, presentacion: p.presentacion });
    setTexto('');
    setAbierto(false);
  };

  const teclado = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && abierto && opciones[activo]) {
      e.preventDefault();
      elegir(opciones[activo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  if (valor) {
    return (
      <div
        className={cn(
          claseCampo,
          'flex h-auto min-h-10 items-center justify-between gap-2 py-1.5',
          className,
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-denso font-semibold">{valor.nombre}</span>
          <span className="block truncate text-meta text-texto-secundario">
            {valor.sku} · {valor.presentacion}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onCambio(null);
            requestAnimationFrame(() => entrada.current?.focus());
          }}
          aria-label="Cambiar producto"
          className="shrink-0 rounded-control p-1 text-texto-secundario hover:bg-fondo"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  const mostrarLista = abierto && busqueda.length >= 2;
  return (
    <div className={cn('relative', className)}>
      <Search
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
      />
      <input
        ref={entrada}
        id={id}
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-invalid={invalido}
        autoComplete="off"
        className={cn(claseCampo, 'pl-9')}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={teclado}
      />
      {mostrarLista && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-panel border border-borde bg-superficie p-1 shadow-flotante"
        >
          {resultados.isFetching && opciones.length === 0 ? (
            <li className="px-3 py-2 text-denso text-texto-secundario">Buscando...</li>
          ) : opciones.length === 0 ? (
            <li className="px-3 py-2 text-denso text-texto-secundario">
              No hay productos que coincidan con “{busqueda}”.
            </li>
          ) : (
            opciones.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(p);
                }}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  'cursor-pointer rounded-control px-3 py-2',
                  i === activo && 'bg-salvia',
                )}
              >
                <span className="block text-denso font-semibold">{p.nombre}</span>
                <span className="block text-meta text-texto-secundario">
                  {p.sku} · {p.principioActivo} · {p.presentacion}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
