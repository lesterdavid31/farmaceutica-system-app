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
  ABRIR_CAJA: 'Abrir caja',
  MOVIMIENTO_CAJA: 'Movimiento de caja',
  CERRAR_CAJA: 'Cerrar caja',
  VENDER: 'Vender',
  ANULAR: 'Anular',
  PREPARAR: 'Preparar pedido',
  ASIGNAR: 'Asignar repartidor',
  ENTREGAR: 'Entregar pedido',
  GENERAR: 'Generar',
  EDITAR_LINEA: 'Editar línea',
  CERRAR: 'Cerrar',
  DAR_DE_BAJA: 'Dar de baja',
  TRASLADAR: 'Trasladar',
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

// ─── Caja y ventas ────────────────────────────────────────────────────────────

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'CONTRA_ENTREGA';
export type TipoMovimientoCaja =
  'VENTA' | 'COBRO_CONTRA_ENTREGA' | 'GASTO' | 'RETIRO' | 'DEPOSITO' | 'ANULACION';
export type EstadoTurnoCaja = 'ABIERTO' | 'CERRADO';
export type EstadoVenta = 'COMPLETADA' | 'ANULADA';
export type CanalVenta = 'MOSTRADOR' | 'CALL_CENTER';

export const METODOS_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  CONTRA_ENTREGA: 'Contra entrega',
};

export const TIPOS_MOVIMIENTO_CAJA: Record<TipoMovimientoCaja, string> = {
  VENTA: 'Venta',
  COBRO_CONTRA_ENTREGA: 'Cobro contra entrega',
  GASTO: 'Gasto',
  RETIRO: 'Retiro',
  DEPOSITO: 'Depósito',
  ANULACION: 'Anulación',
};

export const ESTADOS_VENTA: Record<EstadoVenta, string> = {
  COMPLETADA: 'Completada',
  ANULADA: 'Anulada',
};

export const CANALES_VENTA: Record<CanalVenta, string> = {
  MOSTRADOR: 'Mostrador',
  CALL_CENTER: 'Call center',
};

export interface ResumenCaja {
  montoInicial: string;
  efectivoPorTipo: Record<TipoMovimientoCaja, string>;
  porMetodo: Record<MetodoPago, string>;
  ingresosEfectivo: string;
  egresosEfectivo: string;
  efectivoEsperado: string;
}

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  metodoPago: MetodoPago;
  monto: string;
  referenciaId: string | null;
  descripcion: string | null;
  createdAt: string;
  usuario: { id: string; nombre: string };
}

export interface TurnoCajaResumen {
  id: string;
  estado: EstadoTurnoCaja;
  apertura: string;
  cierre: string | null;
  montoInicial: string;
  efectivoEsperado: string | null;
  efectivoContado: string | null;
  diferencia: string | null;
  observaciones: string | null;
  cajeroId: string;
  ubicacion: UbicacionResumen;
  cajero: { id: string; nombre: string };
  _count: { ventas: number };
}

export interface TurnoCajaDetalle extends Omit<TurnoCajaResumen, '_count'> {
  movimientos: MovimientoCaja[];
  resumen: ResumenCaja;
  ventas: { estado: EstadoVenta; cantidad: number; total: string | null }[];
  puedeOperar: boolean;
}

export interface ProductoVenta {
  id: string;
  sku: string;
  nombre: string;
  principioActivo: string;
  presentacion: string;
  precioVenta: string;
  requiereReceta: boolean;
  vigente: number;
}

export interface PagoVenta {
  id?: string;
  metodo: MetodoPago;
  monto: string;
  referencia?: string | null;
}

export interface VentaResumen {
  id: string;
  numero: number;
  ubicacionId: string;
  nit: string;
  canal: CanalVenta;
  total: string;
  estado: EstadoVenta;
  createdAt: string;
  ubicacion: UbicacionResumen;
  usuario: { id: string; nombre: string };
  pagos: PagoVenta[];
}

export interface VentaDetalle extends VentaResumen {
  turnoCajaId: string | null;
  motivoAnulacion: string | null;
  fechaAnulacion: string | null;
  ubicacion: UbicacionResumen & { direccion: string; telefono: string | null };
  anuladaPor: { id: string; nombre: string } | null;
  turnoCaja: { id: string; estado: EstadoTurnoCaja } | null;
  detalles: {
    id: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
    producto: { id: string; sku: string; nombre: string; presentacion: string };
    lote: { id: string; numeroLote: string; fechaVencimiento: string };
  }[];
  puedeAnular: boolean;
}

// ─── Call center ──────────────────────────────────────────────────────────────

export type EstadoPedido =
  'PENDIENTE' | 'EN_PREPARACION' | 'ASIGNADO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';
export type MetodoPedido = 'CONTRA_ENTREGA' | 'TARJETA';
export type AccionPedido = 'preparar' | 'asignar' | 'salir' | 'entregar' | 'cancelar';
export type FuenteTiempo = 'google' | 'estimado' | 'mixta';

export const ESTADOS_PEDIDO: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  ASIGNADO: 'Asignado',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

export const METODOS_PEDIDO: Record<MetodoPedido, string> = {
  CONTRA_ENTREGA: 'Contra entrega (efectivo)',
  TARJETA: 'Tarjeta al entregar',
};

export interface DireccionCliente {
  id: string;
  alias: string | null;
  direccion: string;
  referencia: string | null;
  municipioId: string | null;
  municipio?: { id: string; nombre: string } | null;
  latitud: string;
  longitud: string;
  principal: boolean;
  activa: boolean;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  nit: string | null;
  email: string | null;
  activo: boolean;
  direcciones: DireccionCliente[];
  _count?: { pedidos: number };
}

export interface ClienteDetalle extends Cliente {
  pedidos: {
    id: string;
    numero: number;
    estado: EstadoPedido;
    total: string;
    fechaCompromiso: string;
    createdAt: string;
    ubicacionDespacho: { nombre: string };
  }[];
}

export interface OpcionDisponibilidad {
  ubicacion: UbicacionResumen & {
    direccion: string;
    telefono: string | null;
    latitud: number;
    longitud: number;
  };
  distanciaKm: number;
  rutaMin: number;
  fuente: 'google' | 'estimado';
  tiempoEstimadoMin: number;
  formasPago: MetodoPedido[];
  cajaAbierta: boolean;
}

export interface RespuestaDisponibilidad {
  destino: { latitud: number; longitud: number };
  preparacionMin: number;
  items: {
    producto: {
      id: string;
      sku: string;
      nombre: string;
      presentacion: string;
      precioVenta: string;
      requiereReceta: boolean;
    };
    cantidad: number;
    subtotal: string;
  }[];
  total: string;
  opciones: OpcionDisponibilidad[];
  mejorId: string | null;
  sugerencia:
    | (OpcionDisponibilidad & {
        traslados: {
          origen: { id: string; nombre: string; tipo: TipoUbicacion };
          distanciaKm: number;
          tiempoMin: number;
          fuente: 'google' | 'estimado';
          items: { productoId: string; cantidad: number; nombre: string }[];
        }[];
        sinCubrir: { productoId: string; cantidad: number; nombre: string }[];
      })
    | null;
  fuente: FuenteTiempo;
}

export interface Repartidor {
  id: string;
  nombres: string;
  apellidos: string;
}

export interface PedidoResumen {
  id: string;
  numero: number;
  estado: EstadoPedido;
  metodoPago: MetodoPedido;
  total: string;
  tiempoEstimadoMin: number;
  distanciaKm: string;
  fuenteEstimacion: 'google' | 'estimado';
  fechaCompromiso: string;
  fechaEntrega: string | null;
  createdAt: string;
  ubicacionDespachoId: string;
  cliente: { id: string; nombre: string; telefono: string };
  ubicacionDespacho: UbicacionResumen;
  entrega: { repartidor: Repartidor; horaSalida: string | null; horaEntrega: string | null } | null;
  atrasado: boolean;
  minutosAtraso: number;
  acciones: AccionPedido[];
  _count: { detalles: number };
}

export interface PedidoDetalle extends Omit<
  PedidoResumen,
  '_count' | 'cliente' | 'ubicacionDespacho'
> {
  observaciones: string | null;
  motivoCancelacion: string | null;
  cliente: { id: string; nombre: string; telefono: string; nit: string | null };
  direccion: DireccionCliente & { municipio: { nombre: string } | null };
  ubicacionDespacho: UbicacionResumen & { direccion: string; telefono: string | null };
  operador: { id: string; nombre: string };
  detalles: {
    id: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
    producto: { id: string; sku: string; nombre: string; presentacion: string };
  }[];
  historial: {
    id: string;
    estadoAnterior: EstadoPedido | null;
    estadoNuevo: EstadoPedido;
    nota: string | null;
    createdAt: string;
    usuario: { id: string; nombre: string };
  }[];
  entrega: (PedidoResumen['entrega'] & { notas: string | null }) | null;
  venta: {
    id: string;
    numero: number;
    estado: EstadoVenta;
    pagos: { metodo: MetodoPago; monto: string; referencia: string | null }[];
  } | null;
  traslados: {
    id: string;
    numero: number;
    estado: EstadoTraslado;
    origen: { id: string; nombre: string };
  }[];
  cajaAbierta: boolean;
}

// ─── Planilla ─────────────────────────────────────────────────────────────────

export type Puesto = 'GERENTE' | 'CAJERO' | 'REPARTIDOR' | 'BODEGUERO' | 'OPERADOR' | 'OTRO';
export type EstadoPlanilla = 'BORRADOR' | 'CERRADA';

export const PUESTOS: Record<Puesto, string> = {
  GERENTE: 'Gerente',
  CAJERO: 'Cajero',
  REPARTIDOR: 'Repartidor',
  BODEGUERO: 'Bodeguero',
  OPERADOR: 'Operador',
  OTRO: 'Otro',
};

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface Empleado {
  id: string;
  nombres: string;
  apellidos: string;
  dpi: string;
  puesto: Puesto;
  salarioBase: string;
  ubicacionId: string;
  fechaIngreso: string;
  activo: boolean;
  usuarioId: string | null;
  ubicacion: UbicacionResumen;
  usuario: { id: string; nombre: string; email: string; rol: Rol } | null;
}

export interface PlanillaResumen {
  id: string;
  ubicacionId: string;
  mes: number;
  anio: number;
  estado: EstadoPlanilla;
  total: string;
  fechaCierre: string | null;
  ubicacion: UbicacionResumen;
  cerradaPor: { id: string; nombre: string } | null;
  _count: { detalles: number };
}

export interface LineaPlanilla {
  id: string;
  salarioBase: string;
  bonificacion: string;
  igss: string;
  otrosDescuentos: string;
  liquido: string;
  empleado: { id: string; nombres: string; apellidos: string; dpi: string; puesto: Puesto };
}

export interface PlanillaDetalle extends Omit<PlanillaResumen, '_count'> {
  detalles: LineaPlanilla[];
  totales: Record<'salarioBase' | 'bonificacion' | 'igss' | 'otrosDescuentos' | 'liquido', string>;
}

export interface ReportePlanilla {
  anio: number;
  ubicaciones: {
    ubicacion: UbicacionResumen;
    meses: Record<number, { id: string; total: string; estado: EstadoPlanilla; empleados: number }>;
    total: string;
  }[];
  consolidado: Record<number, string>;
  total: string;
  borradores: number;
}

// ─── Activos fijos ────────────────────────────────────────────────────────────

export interface CategoriaActivo {
  id: string;
  nombre: string;
  vidaUtilMeses: number;
  _count?: { activos: number };
}

export interface Depreciacion {
  mesesTranscurridos: number;
  mesesDepreciados: number;
  depreciacionMensual: string;
  depreciacionAcumulada: string;
  valorEnLibros: string;
  totalmenteDepreciado: boolean;
}

export interface ActivoFijo {
  id: string;
  codigo: string;
  descripcion: string;
  categoriaId: string;
  ubicacionId: string;
  fechaAdquisicion: string;
  costo: string;
  valorResidual: string;
  vidaUtilMeses: number;
  activo: boolean;
  categoria: { id: string; nombre: string; vidaUtilMeses: number };
  ubicacion: UbicacionResumen;
  depreciacion: Depreciacion;
}

export interface ActivoDetalle extends ActivoFijo {
  fechaFinVidaUtil: string;
  calendario: {
    anio: number;
    depreciacionAnio: string;
    depreciacionAcumulada: string;
    valorEnLibros: string;
  }[];
  historialUbicaciones: {
    id: string;
    motivo: string | null;
    createdAt: string;
    ubicacionOrigen: UbicacionResumen | null;
    ubicacionDestino: UbicacionResumen;
    usuario: { id: string; nombre: string };
  }[];
}

interface Acumulado {
  cantidad: number;
  costo: string;
  depreciacionAcumulada: string;
  valorEnLibros: string;
}

export interface ReporteActivos {
  fecha: string;
  porUbicacion: (Acumulado & { ubicacion: UbicacionResumen })[];
  porCategoria: (Acumulado & { categoria: { id: string; nombre: string } })[];
  totales: Acumulado;
  activos: {
    id: string;
    codigo: string;
    descripcion: string;
    categoria: { id: string; nombre: string };
    ubicacion: UbicacionResumen;
    fechaAdquisicion: string;
    costo: string;
    mesesDepreciados: number;
    vidaUtilMeses: number;
    depreciacionAcumulada: string;
    valorEnLibros: string;
  }[];
}
