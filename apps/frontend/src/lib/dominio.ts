// Tipos y etiquetas del dominio. La interfaz muestra siempre texto legible, nunca el valor del enum.

export type Rol = 'ADMIN' | 'GERENTE' | 'CAJERO' | 'OPERADOR_CALL_CENTER' | 'AUDITOR';
export type TipoUbicacion = 'BODEGA_CENTRAL' | 'FARMACIA_CC' | 'STAND_GASOLINERA';

export const ROLES: Record<Rol, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  CAJERO: 'Cajero',
  OPERADOR_CALL_CENTER: 'Operador de call center',
  AUDITOR: 'Auditor',
};

export const TIPOS_UBICACION: Record<TipoUbicacion, string> = {
  BODEGA_CENTRAL: 'Bodega central',
  FARMACIA_CC: 'Farmacia en centro comercial',
  STAND_GASOLINERA: 'Stand en gasolinera',
};

/** Roles que ven todas las ubicaciones; GERENTE y CAJERO solo la suya. */
export const ROLES_GLOBALES: Rol[] = ['ADMIN', 'AUDITOR', 'OPERADOR_CALL_CENTER'];

export const ACCIONES_BITACORA: Record<string, string> = {
  CREAR: 'Crear',
  ACTUALIZAR: 'Actualizar',
  ELIMINAR: 'Eliminar',
  DESACTIVAR: 'Desactivar',
  LOGIN: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Inicio de sesión fallido',
  SOLICITAR: 'Solicitar',
  APROBAR: 'Aprobar',
  DESPACHAR: 'Despachar',
  RECIBIR: 'Recibir',
  CANCELAR: 'Cancelar',
};

export function etiquetaAccion(accion: string) {
  return (
    ACCIONES_BITACORA[accion] ??
    accion.charAt(0) + accion.slice(1).toLowerCase().replaceAll('_', ' ')
  );
}

export interface UbicacionResumen {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoUbicacion;
}

export interface Perfil {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  ubicacion: UbicacionResumen | null;
}

export interface Ubicacion extends UbicacionResumen {
  direccion: string;
  municipioId: string;
  municipio: { id: string; nombre: string; departamento: { id: string; nombre: string } };
  latitud: string;
  longitud: string;
  telefono: string | null;
  activa: boolean;
}

export interface Departamento {
  id: string;
  codigo: string;
  nombre: string;
  municipios: { id: string; nombre: string }[];
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  ubicacionId: string | null;
  ubicacion: UbicacionResumen | null;
  createdAt: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  _count?: { productos: number };
}

export interface Proveedor {
  id: string;
  nombre: string;
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto: string | null;
  activo: boolean;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  principioActivo: string;
  presentacion: string;
  categoriaId: string;
  categoria: { id: string; nombre: string };
  precioVenta: string;
  requiereReceta: boolean;
  activo: boolean;
}

export interface ParametroConfiguracion {
  clave: string;
  etiqueta: string;
  descripcion: string;
  valor: number;
  porDefecto: number;
  minimo: number;
  maximo: number;
  decimales: number;
  unidad: string;
}

export interface RegistroBitacora {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  datosAntes: unknown;
  datosDespues: unknown;
  ip: string | null;
  createdAt: string;
  usuario: { id: string; nombre: string; email: string; rol: Rol } | null;
}

// ─── Inventario ───────────────────────────────────────────────────────────────

export type Vigencia = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

export type TipoMovimientoInventario =
  | 'COMPRA'
  | 'VENTA'
  | 'ANULACION_VENTA'
  | 'TRASLADO_SALIDA'
  | 'TRASLADO_ENTRADA'
  | 'AJUSTE'
  | 'BAJA_VENCIMIENTO';

export const TIPOS_MOVIMIENTO: Record<TipoMovimientoInventario, string> = {
  COMPRA: 'Compra',
  VENTA: 'Venta',
  ANULACION_VENTA: 'Anulación de venta',
  TRASLADO_SALIDA: 'Salida por traslado',
  TRASLADO_ENTRADA: 'Entrada por traslado',
  AJUSTE: 'Ajuste',
  BAJA_VENCIMIENTO: 'Baja por vencimiento',
};

export interface LoteExistencia {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: string;
  costoUnitario: string;
  cantidad: number;
  ubicacionId: string;
  ubicacion: string;
  vigencia: Vigencia;
  diasParaVencer: number;
}

export interface ExistenciaProducto {
  producto: {
    id: string;
    sku: string;
    nombre: string;
    principioActivo: string;
    presentacion: string;
    requiereReceta: boolean;
    categoria: string;
  };
  vigente: number;
  porVencer: number;
  vencido: number;
  valorCosto: string;
  cantidadMinima: number | null;
  bajoMinimo: boolean;
  lotes: LoteExistencia[];
}

export interface RespuestaExistencias {
  data: ExistenciaProducto[];
  total: number;
  page: number;
  limit: number;
  ubicacionId: string | null;
  diasAlerta: number;
}

export interface StockGlobal {
  producto: { id: string; sku: string; nombre: string; presentacion: string };
  totalVigente: number;
  ubicaciones: {
    ubicacion: { id: string; codigo: string; nombre: string; tipo: TipoUbicacion };
    vigente: number;
    porVencer: number;
    vencido: number;
    proximoVencimiento: string | null;
  }[];
}

export interface MovimientoKardex {
  id: string;
  fecha: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  saldo: number;
  costoUnitario: string;
  motivo: string | null;
  referenciaTipo: string | null;
  referenciaId: string | null;
  ubicacion: { id: string; nombre: string };
  lote: { id: string; numeroLote: string; fechaVencimiento: string };
  usuario: string;
}

export interface ExistenciaAlerta {
  id: string;
  cantidad: number;
  diasParaVencer: number;
  lote: {
    id: string;
    numeroLote: string;
    fechaVencimiento: string;
    costoUnitario: string;
    producto: { id: string; sku: string; nombre: string };
  };
  ubicacion: { id: string; nombre: string };
}

export interface Alertas {
  diasAlerta: number;
  vencidos: ExistenciaAlerta[];
  porVencer: ExistenciaAlerta[];
  bajoMinimo: {
    ubicacion: { id: string; nombre: string };
    producto: { id: string; sku: string; nombre: string };
    cantidadMinima: number;
    vigente: number;
    sugerido: number;
  }[];
}

export interface CompraResumen {
  id: string;
  numeroDocumento: string | null;
  fecha: string;
  total: string;
  proveedor: { id: string; nombre: string };
  usuario: { nombre: string };
  _count: { detalles: number };
}

export interface CompraDetalle extends Omit<CompraResumen, '_count' | 'proveedor'> {
  observaciones: string | null;
  createdAt: string;
  proveedor: { id: string; nombre: string; nit: string };
  ubicacion: { id: string; nombre: string };
  detalles: {
    id: string;
    cantidad: number;
    costoUnitario: string;
    subtotal: string;
    producto: { id: string; sku: string; nombre: string; presentacion: string };
    lote: { id: string; numeroLote: string; fechaVencimiento: string };
  }[];
}

// ─── Traslados ────────────────────────────────────────────────────────────────

export type EstadoTraslado = 'SOLICITADO' | 'APROBADO' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO';
export type MotivoTraslado = 'REABASTECIMIENTO' | 'PEDIDO_CLIENTE';
export type AccionTraslado = 'aprobar' | 'despachar' | 'recibir' | 'cancelar';

export const ESTADOS_TRASLADO: Record<EstadoTraslado, string> = {
  SOLICITADO: 'Solicitado',
  APROBADO: 'Aprobado',
  EN_TRANSITO: 'En tránsito',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

export const MOTIVOS_TRASLADO: Record<MotivoTraslado, string> = {
  REABASTECIMIENTO: 'Reabastecimiento',
  PEDIDO_CLIENTE: 'Pedido de cliente',
};

export interface TrasladoResumen {
  id: string;
  numero: number;
  estado: EstadoTraslado;
  motivo: MotivoTraslado;
  origen: UbicacionResumen;
  destino: UbicacionResumen;
  solicitadoPor: { id: string; nombre: string };
  fechaSolicitud: string;
  fechaDespacho: string | null;
  fechaRecepcion: string | null;
  productos: number;
  unidades: number;
}

export interface DetalleTraslado {
  id: string;
  productoId: string;
  cantidadSolicitada: number;
  cantidadEnviada: number | null;
  cantidadRecibida: number | null;
  /** Existencia vigente del producto en el origen; solo mientras no se despacha. */
  disponibleOrigen?: number;
  producto: { id: string; sku: string; nombre: string; presentacion: string };
  lote: { id: string; numeroLote: string; fechaVencimiento: string } | null;
}

export interface TrasladoDetalle extends Omit<TrasladoResumen, 'productos' | 'unidades'> {
  observaciones: string | null;
  motivoCancelacion: string | null;
  pedido: { id: string; numero: number } | null;
  detalles: DetalleTraslado[];
  historial: {
    estado: EstadoTraslado;
    fecha: string;
    usuario: { id: string; nombre: string } | null;
  }[];
  acciones: AccionTraslado[];
}
