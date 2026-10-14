import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useSesion, useUsuario } from '@/auth/sesion';
import { Logo } from '@/components/Logo';
import { Select } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, type Pagina } from '@/lib/api';
import { ROLES, type Ubicacion } from '@/lib/dominio';
import { cn } from '@/lib/utils';
import { navegacionPara } from './navegacion';

function MenuLateral({ onNavegar }: { onNavegar?: () => void }) {
  const usuario = useUsuario();
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-4 px-3 py-4">
      {navegacionPara(usuario).map((seccion, i) => (
        <div key={seccion.titulo ?? i}>
          {seccion.titulo && (
            <p className="m-0 mb-1 px-3 text-meta font-semibold text-texto-secundario">
              {seccion.titulo}
            </p>
          )}
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {seccion.items.map((item) => (
              <li key={item.ruta}>
                <NavLink
                  to={item.ruta}
                  end={item.ruta === '/' || item.fin}
                  onClick={onNavegar}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-3 rounded-r-control border-l-3 px-3 text-denso no-underline transition-colors duration-150',
                      isActive
                        ? 'border-verde-botica bg-salvia font-semibold text-verde-botica'
                        : 'border-transparent text-texto hover:bg-fondo',
                    )
                  }
                >
                  <item.icono size={18} strokeWidth={1.75} aria-hidden="true" />
                  {item.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Selector de ubicación para filtrar, solo para ADMIN y AUDITOR (sección 8). */
function SelectorUbicacion() {
  const { ubicacionId, setUbicacionId } = useFiltroUbicacion();
  const { data } = useQuery({
    queryKey: ['ubicaciones', 'selector'],
    queryFn: () => api.get<Pagina<Ubicacion>>('/ubicaciones?limit=100&activa=true'),
    staleTime: 5 * 60_000,
  });
  return (
    <label className="flex items-center gap-2 text-denso">
      <span className="hidden text-texto-secundario md:inline">Ubicación</span>
      <Select
        value={ubicacionId}
        onChange={(e) => setUbicacionId(e.target.value)}
        className="h-9 w-40 text-denso sm:w-64"
        aria-label="Filtrar por ubicación"
      >
        <option value="">Todas las ubicaciones</option>
        {data?.data.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </Select>
    </label>
  );
}

function MenuUsuario() {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-fondo">
        <span className="hidden flex-col sm:flex">
          <span className="text-denso font-semibold">{usuario.nombre}</span>
          <span className="text-meta text-texto-secundario">
            {ROLES[usuario.rol]}
            {usuario.ubicacion && ` · ${usuario.ubicacion.nombre}`}
          </span>
        </span>
        <span className="text-denso font-semibold sm:hidden">{usuario.nombre.split(' ')[0]}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{usuario.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => cerrarSesion()}>
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const usuario = useUsuario();
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex min-h-screen bg-fondo">
      {/* Menú lateral fijo en escritorio */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-borde bg-superficie lg:block">
        <div className="flex h-14 items-center border-b border-borde px-6">
          <Logo />
        </div>
        <MenuLateral />
      </aside>

      {/* Menú lateral en tablet y móvil */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-texto/40"
            onClick={() => setMenuAbierto(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-borde bg-superficie shadow-flotante">
            <div className="flex h-14 items-center justify-between border-b border-borde px-4">
              <Logo />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMenuAbierto(false)}
                className="rounded-control p-2 hover:bg-fondo"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <MenuLateral onNavegar={() => setMenuAbierto(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borde bg-superficie px-4 sm:px-8">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMenuAbierto(true)}
            className="rounded-control p-2 hover:bg-fondo lg:hidden"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
          {/* En el celular el logo cede su espacio al selector de ubicación y al usuario. */}
          <div className="hidden sm:block lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {esGlobal(usuario) && usuario.rol !== 'OPERADOR_CALL_CENTER' && <SelectorUbicacion />}
            <MenuUsuario />
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
