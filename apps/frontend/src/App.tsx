import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { RutaAutenticada, SoloRoles } from '@/auth/RutaProtegida';
import { Cargando, Pagina } from '@/components/pagina';
import { AppLayout } from '@/layout/AppLayout';
import type { Rol } from '@/lib/dominio';
import { Inicio } from '@/pages/Inicio';
import { Login } from '@/pages/Login';

/** Las pantallas se descargan al visitarlas, para que el login y el inicio carguen rápido. */
function diferida<M>(cargar: () => Promise<M>, nombre: keyof M) {
  return lazy(async () => ({ default: (await cargar())[nombre] as ComponentType }));
}

const Bitacora = diferida(() => import('@/pages/auditoria/Bitacora'), 'Bitacora');
const Categorias = diferida(() => import('@/pages/admin/Categorias'), 'Categorias');
const Configuracion = diferida(() => import('@/pages/admin/Configuracion'), 'Configuracion');
const Productos = diferida(() => import('@/pages/admin/Productos'), 'Productos');
const Proveedores = diferida(() => import('@/pages/admin/Proveedores'), 'Proveedores');
const Ubicaciones = diferida(() => import('@/pages/admin/Ubicaciones'), 'Ubicaciones');
const Usuarios = diferida(() => import('@/pages/admin/Usuarios'), 'Usuarios');
const EstadoSistema = diferida(() => import('@/pages/EstadoSistema'), 'EstadoSistema');
const Existencias = diferida(() => import('@/pages/inventario/Existencias'), 'Existencias');
const Kardex = diferida(() => import('@/pages/inventario/Kardex'), 'Kardex');
const Alertas = diferida(() => import('@/pages/inventario/Alertas'), 'Alertas');
const Compras = diferida(() => import('@/pages/compras/Compras'), 'Compras');
const DetalleCompra = diferida(() => import('@/pages/compras/Compras'), 'DetalleCompra');
const NuevaCompra = diferida(() => import('@/pages/compras/NuevaCompra'), 'NuevaCompra');
const Traslados = diferida(() => import('@/pages/traslados/Traslados'), 'Traslados');
const NuevoTraslado = diferida(() => import('@/pages/traslados/NuevoTraslado'), 'NuevoTraslado');
const DetalleTraslado = diferida(
  () => import('@/pages/traslados/DetalleTraslado'),
  'DetalleTraslado',
);

const TODOS: Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'OPERADOR_CALL_CENTER', 'AUDITOR'];
const ADMINISTRACION: Rol[] = ['ADMIN', 'AUDITOR'];
const SUPERVISION: Rol[] = ['ADMIN', 'AUDITOR', 'GERENTE'];

const solo = (roles: Rol[], pantalla: ReactNode) => (
  <SoloRoles roles={roles}>
    <Suspense
      fallback={
        <Pagina>
          <Cargando texto="Cargando la pantalla..." />
        </Pagina>
      }
    >
      {pantalla}
    </Suspense>
  </SoloRoles>
);

function NoEncontrada() {
  return (
    <Pagina>
      <h1 className="m-0 text-pagina font-semibold">Página no encontrada</h1>
      <p className="mt-2 text-cuerpo text-texto-secundario">
        La dirección no existe.{' '}
        <Link to="/" className="text-verde-botica">
          Volver al inicio
        </Link>
      </p>
    </Pagina>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: (
      <RutaAutenticada>
        <AppLayout />
      </RutaAutenticada>
    ),
    children: [
      { index: true, element: <Inicio /> },
      { path: 'inventario/existencias', element: solo(TODOS, <Existencias />) },
      { path: 'inventario/alertas', element: solo(SUPERVISION, <Alertas />) },
      { path: 'inventario/kardex', element: solo(SUPERVISION, <Kardex />) },
      { path: 'compras', element: solo(SUPERVISION, <Compras />) },
      { path: 'compras/nueva', element: solo(['ADMIN', 'GERENTE'], <NuevaCompra />) },
      { path: 'compras/:id', element: solo(SUPERVISION, <DetalleCompra />) },
      { path: 'traslados', element: solo(SUPERVISION, <Traslados />) },
      { path: 'traslados/nuevo', element: solo(['ADMIN', 'GERENTE'], <NuevoTraslado />) },
      { path: 'traslados/:id', element: solo(SUPERVISION, <DetalleTraslado />) },
      { path: 'auditoria/bitacora', element: solo(ADMINISTRACION, <Bitacora />) },
      { path: 'admin/usuarios', element: solo(ADMINISTRACION, <Usuarios />) },
      { path: 'admin/ubicaciones', element: solo(ADMINISTRACION, <Ubicaciones />) },
      { path: 'admin/productos', element: solo(ADMINISTRACION, <Productos />) },
      { path: 'admin/categorias', element: solo(ADMINISTRACION, <Categorias />) },
      { path: 'admin/proveedores', element: solo(ADMINISTRACION, <Proveedores />) },
      { path: 'admin/configuracion', element: solo(ADMINISTRACION, <Configuracion />) },
      { path: 'admin/estado', element: solo(['ADMIN'], <EstadoSistema />) },
      { path: '*', element: <NoEncontrada /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
