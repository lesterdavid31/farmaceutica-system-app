import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { RutaAutenticada, SoloRoles } from '@/auth/RutaProtegida';
import { tieneRol, useUsuario } from '@/auth/sesion';
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
const Caja = diferida(() => import('@/pages/caja/Caja'), 'Caja');
const Turnos = diferida(() => import('@/pages/caja/Turnos'), 'Turnos');
const DetalleTurno = diferida(() => import('@/pages/caja/Turnos'), 'DetalleTurno');
const PuntoVenta = diferida(() => import('@/pages/ventas/PuntoVenta'), 'PuntoVenta');
const Ventas = diferida(() => import('@/pages/ventas/Ventas'), 'Ventas');
const DetalleVenta = diferida(() => import('@/pages/ventas/Ventas'), 'DetalleVenta');
const Comprobante = diferida(() => import('@/pages/ventas/Comprobante'), 'Comprobante');
const Clientes = diferida(() => import('@/pages/callcenter/Clientes'), 'Clientes');
const DetalleCliente = diferida(() => import('@/pages/callcenter/Clientes'), 'DetalleCliente');
const NuevoPedido = diferida(() => import('@/pages/callcenter/NuevoPedido'), 'NuevoPedido');
const Pedidos = diferida(() => import('@/pages/pedidos/Pedidos'), 'Pedidos');
const DetallePedido = diferida(() => import('@/pages/pedidos/DetallePedido'), 'DetallePedido');
const Empleados = diferida(() => import('@/pages/planilla/Empleados'), 'Empleados');
const Planillas = diferida(() => import('@/pages/planilla/Planillas'), 'Planillas');
const DetallePlanilla = diferida(() => import('@/pages/planilla/Planillas'), 'DetallePlanilla');
const ReportePlanilla = diferida(
  () => import('@/pages/planilla/ReportePlanilla'),
  'ReportePlanilla',
);
const Activos = diferida(() => import('@/pages/activos/Activos'), 'Activos');
const DetalleActivo = diferida(() => import('@/pages/activos/Activos'), 'DetalleActivo');
const ReporteActivos = diferida(() => import('@/pages/activos/ReporteActivos'), 'ReporteActivos');
const Dashboard = diferida(() => import('@/pages/Dashboard'), 'Dashboard');
const FlujoEfectivo = diferida(() => import('@/pages/auditoria/FlujoEfectivo'), 'FlujoEfectivo');
const MovimientoMedicamentos = diferida(
  () => import('@/pages/auditoria/MovimientoMedicamentos'),
  'MovimientoMedicamentos',
);
const DetalleTraslado = diferida(
  () => import('@/pages/traslados/DetalleTraslado'),
  'DetalleTraslado',
);

const TODOS: Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'OPERADOR_CALL_CENTER', 'AUDITOR'];
const ADMINISTRACION: Rol[] = ['ADMIN', 'AUDITOR'];
const SUPERVISION: Rol[] = ['ADMIN', 'AUDITOR', 'GERENTE'];
const VENTAS: Rol[] = ['ADMIN', 'AUDITOR', 'GERENTE', 'CAJERO'];
const CALL_CENTER: Rol[] = ['ADMIN', 'AUDITOR', 'OPERADOR_CALL_CENTER'];

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

/** ADMIN, AUDITOR y GERENTE entran a su dashboard (RF-32, RF-37); los demás, a sus módulos. */
function PaginaInicio() {
  const usuario = useUsuario();
  return tieneRol(usuario, SUPERVISION) ? (
    <Suspense
      fallback={
        <Pagina>
          <Cargando texto="Cargando el dashboard..." />
        </Pagina>
      }
    >
      <Dashboard />
    </Suspense>
  ) : (
    <Inicio />
  );
}

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
    // El comprobante se imprime sin el menú ni la barra superior.
    path: '/ventas/:id/comprobante',
    element: <RutaAutenticada>{solo(VENTAS, <Comprobante />)}</RutaAutenticada>,
  },
  {
    element: (
      <RutaAutenticada>
        <AppLayout />
      </RutaAutenticada>
    ),
    children: [
      { index: true, element: <PaginaInicio /> },
      { path: 'auditoria/flujo-efectivo', element: solo(SUPERVISION, <FlujoEfectivo />) },
      { path: 'auditoria/movimientos', element: solo(SUPERVISION, <MovimientoMedicamentos />) },
      { path: 'inventario/existencias', element: solo(TODOS, <Existencias />) },
      { path: 'inventario/alertas', element: solo(SUPERVISION, <Alertas />) },
      { path: 'inventario/kardex', element: solo(SUPERVISION, <Kardex />) },
      { path: 'compras', element: solo(SUPERVISION, <Compras />) },
      { path: 'compras/nueva', element: solo(['ADMIN', 'GERENTE'], <NuevaCompra />) },
      { path: 'compras/:id', element: solo(SUPERVISION, <DetalleCompra />) },
      { path: 'traslados', element: solo(SUPERVISION, <Traslados />) },
      { path: 'traslados/nuevo', element: solo(['ADMIN', 'GERENTE'], <NuevoTraslado />) },
      { path: 'traslados/:id', element: solo(SUPERVISION, <DetalleTraslado />) },
      { path: 'punto-de-venta', element: solo(['CAJERO'], <PuntoVenta />) },
      { path: 'caja', element: solo(['CAJERO'], <Caja />) },
      { path: 'caja/turnos', element: solo(VENTAS, <Turnos />) },
      { path: 'caja/turnos/:id', element: solo(VENTAS, <DetalleTurno />) },
      { path: 'ventas', element: solo(VENTAS, <Ventas />) },
      { path: 'ventas/:id', element: solo(VENTAS, <DetalleVenta />) },
      {
        path: 'call-center/nuevo-pedido',
        element: solo(['ADMIN', 'OPERADOR_CALL_CENTER'], <NuevoPedido />),
      },
      { path: 'call-center/clientes', element: solo(CALL_CENTER, <Clientes />) },
      { path: 'call-center/clientes/:id', element: solo(CALL_CENTER, <DetalleCliente />) },
      { path: 'pedidos', element: solo(TODOS, <Pedidos />) },
      { path: 'pedidos/:id', element: solo(TODOS, <DetallePedido />) },
      { path: 'planilla/empleados', element: solo(SUPERVISION, <Empleados />) },
      { path: 'planilla/planillas', element: solo(SUPERVISION, <Planillas />) },
      { path: 'planilla/planillas/:id', element: solo(SUPERVISION, <DetallePlanilla />) },
      { path: 'planilla/reporte', element: solo(SUPERVISION, <ReportePlanilla />) },
      { path: 'activos', element: solo(SUPERVISION, <Activos />) },
      { path: 'activos/reporte', element: solo(SUPERVISION, <ReporteActivos />) },
      { path: 'activos/:id', element: solo(SUPERVISION, <DetalleActivo />) },
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
