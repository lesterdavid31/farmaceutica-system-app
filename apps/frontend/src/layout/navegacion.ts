import {
  Activity,
  BadgeDollarSign,
  Building,
  ChartColumn,
  Contact,
  FileSpreadsheet,
  BookUser,
  Headset,
  PackageSearch,
  Banknote,
  ClipboardList,
  Receipt,
  ShoppingCart,
  ArrowLeftRight,
  BellRing,
  Boxes,
  Building2,
  FolderTree,
  History,
  House,
  PackagePlus,
  Pill,
  ScrollText,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { esGerenteBodega } from '@/auth/permisos';
import type { Perfil, Rol } from '@/lib/dominio';

export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  roles: readonly Rol[];
  /** Solo se marca activo con la ruta exacta (por ejemplo, /caja frente a /caja/turnos). */
  fin?: boolean;
  /** Condición adicional al rol (por ejemplo, ser gerente de la bodega). */
  visible?: (usuario: Perfil) => boolean;
}

export interface SeccionNavegacion {
  titulo?: string;
  items: ItemNavegacion[];
}

const TODOS: readonly Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'OPERADOR_CALL_CENTER', 'AUDITOR'];
const ADMINISTRACION: readonly Rol[] = ['ADMIN', 'AUDITOR'];
const SUPERVISION: readonly Rol[] = ['ADMIN', 'AUDITOR', 'GERENTE'];
const VENTAS: readonly Rol[] = ['ADMIN', 'AUDITOR', 'GERENTE', 'CAJERO'];

/** Menú lateral. Cada fase agrega sus módulos aquí; solo se muestran los que el usuario puede usar. */
export const NAVEGACION: SeccionNavegacion[] = [
  { items: [{ ruta: '/', etiqueta: 'Inicio', icono: House, roles: TODOS }] },
  {
    titulo: 'Call center',
    items: [
      {
        ruta: '/call-center/nuevo-pedido',
        etiqueta: 'Nuevo pedido',
        icono: Headset,
        roles: ['ADMIN', 'OPERADOR_CALL_CENTER'],
      },
      { ruta: '/pedidos', etiqueta: 'Pedidos', icono: PackageSearch, roles: TODOS },
      {
        ruta: '/call-center/clientes',
        etiqueta: 'Clientes',
        icono: BookUser,
        roles: ['ADMIN', 'AUDITOR', 'OPERADOR_CALL_CENTER'],
      },
    ],
  },
  {
    titulo: 'Ventas y caja',
    items: [
      {
        ruta: '/punto-de-venta',
        etiqueta: 'Punto de venta',
        icono: ShoppingCart,
        roles: ['CAJERO'],
      },
      { ruta: '/caja', etiqueta: 'Caja', icono: Banknote, roles: ['CAJERO'], fin: true },
      { ruta: '/ventas', etiqueta: 'Ventas', icono: Receipt, roles: VENTAS },
      { ruta: '/caja/turnos', etiqueta: 'Turnos de caja', icono: ClipboardList, roles: VENTAS },
    ],
  },
  {
    titulo: 'Inventario',
    items: [
      { ruta: '/inventario/existencias', etiqueta: 'Existencias', icono: Boxes, roles: TODOS },
      { ruta: '/inventario/alertas', etiqueta: 'Alertas', icono: BellRing, roles: SUPERVISION },
      { ruta: '/inventario/kardex', etiqueta: 'Kardex', icono: History, roles: SUPERVISION },
      {
        ruta: '/compras',
        etiqueta: 'Compras',
        icono: PackagePlus,
        roles: SUPERVISION,
        visible: (u) => u.rol !== 'GERENTE' || esGerenteBodega(u),
      },
      { ruta: '/traslados', etiqueta: 'Traslados', icono: ArrowLeftRight, roles: SUPERVISION },
    ],
  },
  {
    titulo: 'Planilla',
    items: [
      { ruta: '/planilla/empleados', etiqueta: 'Empleados', icono: Contact, roles: SUPERVISION },
      {
        ruta: '/planilla/planillas',
        etiqueta: 'Planillas',
        icono: BadgeDollarSign,
        roles: SUPERVISION,
      },
      {
        ruta: '/planilla/reporte',
        etiqueta: 'Reporte de planilla',
        icono: FileSpreadsheet,
        roles: SUPERVISION,
      },
    ],
  },
  {
    titulo: 'Activos fijos',
    items: [
      { ruta: '/activos', etiqueta: 'Activos', icono: Building, roles: SUPERVISION, fin: true },
      {
        ruta: '/activos/reporte',
        etiqueta: 'Reporte de activos',
        icono: ChartColumn,
        roles: SUPERVISION,
      },
    ],
  },
  {
    titulo: 'Auditoría',
    items: [
      {
        ruta: '/auditoria/bitacora',
        etiqueta: 'Bitácora',
        icono: ScrollText,
        roles: ADMINISTRACION,
      },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: '/admin/usuarios', etiqueta: 'Usuarios', icono: Users, roles: ADMINISTRACION },
      {
        ruta: '/admin/ubicaciones',
        etiqueta: 'Ubicaciones',
        icono: Building2,
        roles: ADMINISTRACION,
      },
      { ruta: '/admin/productos', etiqueta: 'Productos', icono: Pill, roles: ADMINISTRACION },
      {
        ruta: '/admin/categorias',
        etiqueta: 'Categorías',
        icono: FolderTree,
        roles: ADMINISTRACION,
      },
      { ruta: '/admin/proveedores', etiqueta: 'Proveedores', icono: Truck, roles: ADMINISTRACION },
      {
        ruta: '/admin/configuracion',
        etiqueta: 'Configuración',
        icono: Settings,
        roles: ADMINISTRACION,
      },
      { ruta: '/admin/estado', etiqueta: 'Estado del sistema', icono: Activity, roles: ['ADMIN'] },
    ],
  },
];

export function navegacionPara(usuario: Perfil): SeccionNavegacion[] {
  return NAVEGACION.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(usuario.rol) && (i.visible?.(usuario) ?? true)),
  })).filter((s) => s.items.length > 0);
}
