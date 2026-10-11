import {
  Activity,
  Building2,
  FolderTree,
  House,
  Pill,
  ScrollText,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Rol } from '@/lib/dominio';

export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  roles: readonly Rol[];
}

export interface SeccionNavegacion {
  titulo?: string;
  items: ItemNavegacion[];
}

const TODOS: readonly Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'OPERADOR_CALL_CENTER', 'AUDITOR'];
const ADMINISTRACION: readonly Rol[] = ['ADMIN', 'AUDITOR'];

/** Menú lateral. Cada fase agrega sus módulos aquí; solo se muestran los que el rol puede usar. */
export const NAVEGACION: SeccionNavegacion[] = [
  { items: [{ ruta: '/', etiqueta: 'Inicio', icono: House, roles: TODOS }] },
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

export function navegacionPara(rol: Rol): SeccionNavegacion[] {
  return NAVEGACION.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(rol)),
  })).filter((s) => s.items.length > 0);
}
