// Datos base del seed: geografía, ubicaciones, usuarios, catálogo y configuración.
// Las coordenadas son aproximadas pero reales, para que el cálculo de tiempos de entrega tenga sentido.

import { Rol, TipoUbicacion } from '../../src/generated/prisma/enums';

/** Contraseña de todos los usuarios de demostración (documentada en el README). */
export const PASSWORD_DEMO = 'Farmacia2026!';

/** Los 22 departamentos de Guatemala con su código oficial. */
export const DEPARTAMENTOS: [codigo: string, nombre: string][] = [
  ['01', 'Guatemala'],
  ['02', 'El Progreso'],
  ['03', 'Sacatepéquez'],
  ['04', 'Chimaltenango'],
  ['05', 'Escuintla'],
  ['06', 'Santa Rosa'],
  ['07', 'Sololá'],
  ['08', 'Totonicapán'],
  ['09', 'Quetzaltenango'],
  ['10', 'Suchitepéquez'],
  ['11', 'Retalhuleu'],
  ['12', 'San Marcos'],
  ['13', 'Huehuetenango'],
  ['14', 'Quiché'],
  ['15', 'Baja Verapaz'],
  ['16', 'Alta Verapaz'],
  ['17', 'Petén'],
  ['18', 'Izabal'],
  ['19', 'Zacapa'],
  ['20', 'Chiquimula'],
  ['21', 'Jalapa'],
  ['22', 'Jutiapa'],
];

/** Municipios de las ubicaciones del seed y algunos vecinos para direcciones de clientes. */
export const MUNICIPIOS: [departamento: string, municipio: string][] = [
  ['Guatemala', 'Guatemala'],
  ['Guatemala', 'Mixco'],
  ['Guatemala', 'Villa Nueva'],
  ['Quetzaltenango', 'Quetzaltenango'],
  ['Quetzaltenango', 'Salcajá'],
  ['Escuintla', 'Escuintla'],
  ['Huehuetenango', 'Huehuetenango'],
  ['Alta Verapaz', 'Cobán'],
  ['Alta Verapaz', 'San Pedro Carchá'],
  ['Petén', 'Flores'],
  ['Petén', 'San Benito'],
  ['Chimaltenango', 'Chimaltenango'],
  ['Zacapa', 'Zacapa'],
  ['Retalhuleu', 'Retalhuleu'],
];

export interface UbicacionSeed {
  codigo: string;
  nombre: string;
  tipo: TipoUbicacion;
  departamento: string;
  municipio: string;
  direccion: string;
  latitud: number;
  longitud: number;
  telefono: string;
  /** Sufijo de los correos de gerente y cajero, por ejemplo gerente.xela@farmacia.gt */
  slug: string;
  responsable: { gerente: string; cajero?: string };
}

export const UBICACIONES: UbicacionSeed[] = [
  {
    codigo: 'BOD-CENTRAL',
    nombre: 'Bodega Central',
    tipo: TipoUbicacion.BODEGA_CENTRAL,
    departamento: 'Guatemala',
    municipio: 'Guatemala',
    direccion: 'Calzada Atanasio Tzul 22-00, zona 12',
    latitud: 14.5935,
    longitud: -90.531,
    telefono: '2440-1000',
    slug: 'bodega',
    responsable: { gerente: 'Ricardo Morales' },
  },
  {
    codigo: 'CC-XELA',
    nombre: 'Farmacia Interplaza Xela',
    tipo: TipoUbicacion.FARMACIA_CC,
    departamento: 'Quetzaltenango',
    municipio: 'Quetzaltenango',
    direccion: 'Centro comercial Interplaza Xela, 4a. calle 19-20, zona 3',
    latitud: 14.84,
    longitud: -91.5265,
    telefono: '7763-2100',
    slug: 'xela',
    responsable: { gerente: 'Ana Lucía Pérez', cajero: 'José Daniel Cifuentes' },
  },
  {
    codigo: 'CC-ESCUINTLA',
    nombre: 'Farmacia Plaza Palmeras',
    tipo: TipoUbicacion.FARMACIA_CC,
    departamento: 'Escuintla',
    municipio: 'Escuintla',
    direccion: 'Centro comercial Plaza Palmeras, 1a. avenida 3-50, zona 1',
    latitud: 14.2964,
    longitud: -90.7869,
    telefono: '7888-3200',
    slug: 'escuintla',
    responsable: { gerente: 'Carlos Enrique Monterroso', cajero: 'Sofía Alejandra Barrios' },
  },
  {
    codigo: 'CC-HUEHUE',
    nombre: 'Farmacia Pradera Huehuetenango',
    tipo: TipoUbicacion.FARMACIA_CC,
    departamento: 'Huehuetenango',
    municipio: 'Huehuetenango',
    direccion: 'Centro comercial Pradera, kilómetro 259, zona 10',
    latitud: 15.3197,
    longitud: -91.4734,
    telefono: '7769-4300',
    slug: 'huehue',
    responsable: { gerente: 'María José Recinos', cajero: 'Luis Fernando Castillo' },
  },
  {
    codigo: 'CC-COBAN',
    nombre: 'Farmacia Plaza Magdalena',
    tipo: TipoUbicacion.FARMACIA_CC,
    departamento: 'Alta Verapaz',
    municipio: 'Cobán',
    direccion: 'Centro comercial Plaza Magdalena, 1a. calle 15-20, zona 2',
    latitud: 15.4722,
    longitud: -90.3796,
    telefono: '7951-5400',
    slug: 'coban',
    responsable: { gerente: 'Héctor Rolando Caal', cajero: 'Gabriela Xol' },
  },
  {
    codigo: 'CC-PETEN',
    nombre: 'Farmacia Metro Plaza Mundo Maya',
    tipo: TipoUbicacion.FARMACIA_CC,
    departamento: 'Petén',
    municipio: 'Flores',
    direccion: 'Centro comercial Metro Plaza Mundo Maya, Santa Elena',
    latitud: 16.914,
    longitud: -89.883,
    telefono: '7926-6500',
    slug: 'peten',
    responsable: { gerente: 'Wendy Carolina Chayax', cajero: 'Marvin Estuardo Tesucún' },
  },
  {
    codigo: 'SG-CHIMAL',
    nombre: 'Stand Gasolinera Chimaltenango',
    tipo: TipoUbicacion.STAND_GASOLINERA,
    departamento: 'Chimaltenango',
    municipio: 'Chimaltenango',
    direccion: 'Tienda de gasolinera, kilómetro 54 carretera Interamericana',
    latitud: 14.662,
    longitud: -90.824,
    telefono: '7839-7600',
    slug: 'chimal',
    responsable: { gerente: 'Edgar Raúl Sotz', cajero: 'Andrea Patzán' },
  },
  {
    codigo: 'SG-ZACAPA',
    nombre: 'Stand Gasolinera Zacapa',
    tipo: TipoUbicacion.STAND_GASOLINERA,
    departamento: 'Zacapa',
    municipio: 'Zacapa',
    direccion: 'Tienda de gasolinera, kilómetro 146 carretera al Atlántico',
    latitud: 14.9725,
    longitud: -89.529,
    telefono: '7941-8700',
    slug: 'zacapa',
    responsable: { gerente: 'Oscar Armando Guerra', cajero: 'Karla Michelle Portillo' },
  },
  {
    codigo: 'SG-REU',
    nombre: 'Stand Gasolinera Retalhuleu',
    tipo: TipoUbicacion.STAND_GASOLINERA,
    departamento: 'Retalhuleu',
    municipio: 'Retalhuleu',
    direccion: 'Tienda de gasolinera, 5a. avenida y calzada Las Palmas',
    latitud: 14.537,
    longitud: -91.678,
    telefono: '7771-9800',
    slug: 'reu',
    responsable: { gerente: 'Byron Estuardo Ochoa', cajero: 'Mónica Fabiola Rivas' },
  },
];

/** Usuarios de alcance global, sin ubicación. */
export const USUARIOS_GLOBALES: { email: string; nombre: string; rol: Rol }[] = [
  { email: 'admin@farmacia.gt', nombre: 'Administración General', rol: Rol.ADMIN },
  { email: 'auditor@farmacia.gt', nombre: 'Patricia Hernández (Auditoría)', rol: Rol.AUDITOR },
  {
    email: 'operador@farmacia.gt',
    nombre: 'Diego Alvarado (Call center)',
    rol: Rol.OPERADOR_CALL_CENTER,
  },
];

export const CATEGORIAS: [nombre: string, descripcion: string][] = [
  ['Analgésicos y antiinflamatorios', 'Alivio del dolor, la fiebre y la inflamación'],
  ['Antibióticos', 'Tratamiento de infecciones bacterianas'],
  ['Antihistamínicos', 'Alergias y rinitis'],
  ['Gastrointestinales', 'Acidez, diarrea, náusea y malestar digestivo'],
  ['Cardiovasculares y metabólicos', 'Presión arterial, colesterol y diabetes'],
  ['Respiratorios', 'Tos, asma y vías respiratorias'],
  ['Vitaminas y suplementos', 'Vitaminas, minerales y suplementos'],
  ['Dermatológicos', 'Cremas y tratamientos para la piel'],
  ['Antiparasitarios', 'Tratamiento de parásitos intestinales'],
];

export interface ProductoSeed {
  nombre: string;
  principioActivo: string;
  presentacion: string;
  categoria: string;
  precio: number;
  receta?: boolean;
}

export const PRODUCTOS: ProductoSeed[] = [
  // Analgésicos y antiinflamatorios
  {
    nombre: 'Acetaminofén 500 mg',
    principioActivo: 'Paracetamol',
    presentacion: 'Caja con 100 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 35,
  },
  {
    nombre: 'Acetaminofén jarabe 120 mg/5 ml',
    principioActivo: 'Paracetamol',
    presentacion: 'Frasco de 60 ml',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 22.5,
  },
  {
    nombre: 'Ibuprofeno 400 mg',
    principioActivo: 'Ibuprofeno',
    presentacion: 'Caja con 50 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 42,
  },
  {
    nombre: 'Ibuprofeno 600 mg',
    principioActivo: 'Ibuprofeno',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 48,
  },
  {
    nombre: 'Naproxeno 550 mg',
    principioActivo: 'Naproxeno sódico',
    presentacion: 'Caja con 20 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 55,
  },
  {
    nombre: 'Diclofenaco 50 mg',
    principioActivo: 'Diclofenaco sódico',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 30,
  },
  {
    nombre: 'Ácido acetilsalicílico 100 mg',
    principioActivo: 'Ácido acetilsalicílico',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 18,
  },
  {
    nombre: 'Ketorolaco 10 mg',
    principioActivo: 'Ketorolaco trometamina',
    presentacion: 'Caja con 10 tabletas',
    categoria: 'Analgésicos y antiinflamatorios',
    precio: 28,
    receta: true,
  },
  // Antibióticos
  {
    nombre: 'Amoxicilina 500 mg',
    principioActivo: 'Amoxicilina',
    presentacion: 'Caja con 21 cápsulas',
    categoria: 'Antibióticos',
    precio: 45,
    receta: true,
  },
  {
    nombre: 'Amoxicilina con ácido clavulánico 875/125 mg',
    principioActivo: 'Amoxicilina, ácido clavulánico',
    presentacion: 'Caja con 14 tabletas',
    categoria: 'Antibióticos',
    precio: 120,
    receta: true,
  },
  {
    nombre: 'Azitromicina 500 mg',
    principioActivo: 'Azitromicina',
    presentacion: 'Caja con 3 tabletas',
    categoria: 'Antibióticos',
    precio: 65,
    receta: true,
  },
  {
    nombre: 'Ciprofloxacino 500 mg',
    principioActivo: 'Ciprofloxacino',
    presentacion: 'Caja con 10 tabletas',
    categoria: 'Antibióticos',
    precio: 38,
    receta: true,
  },
  {
    nombre: 'Cefalexina 500 mg',
    principioActivo: 'Cefalexina',
    presentacion: 'Caja con 21 cápsulas',
    categoria: 'Antibióticos',
    precio: 52,
    receta: true,
  },
  {
    nombre: 'Claritromicina 500 mg',
    principioActivo: 'Claritromicina',
    presentacion: 'Caja con 14 tabletas',
    categoria: 'Antibióticos',
    precio: 140,
    receta: true,
  },
  {
    nombre: 'Trimetoprim con sulfametoxazol 160/800 mg',
    principioActivo: 'Trimetoprim, sulfametoxazol',
    presentacion: 'Caja con 20 tabletas',
    categoria: 'Antibióticos',
    precio: 25,
    receta: true,
  },
  {
    nombre: 'Metronidazol 500 mg',
    principioActivo: 'Metronidazol',
    presentacion: 'Caja con 20 tabletas',
    categoria: 'Antibióticos',
    precio: 24,
    receta: true,
  },
  // Antihistamínicos
  {
    nombre: 'Loratadina 10 mg',
    principioActivo: 'Loratadina',
    presentacion: 'Caja con 10 tabletas',
    categoria: 'Antihistamínicos',
    precio: 20,
  },
  {
    nombre: 'Cetirizina 10 mg',
    principioActivo: 'Cetirizina',
    presentacion: 'Caja con 10 tabletas',
    categoria: 'Antihistamínicos',
    precio: 22,
  },
  {
    nombre: 'Clorfenamina 4 mg',
    principioActivo: 'Clorfenamina maleato',
    presentacion: 'Caja con 20 tabletas',
    categoria: 'Antihistamínicos',
    precio: 12,
  },
  {
    nombre: 'Desloratadina 5 mg',
    principioActivo: 'Desloratadina',
    presentacion: 'Caja con 10 tabletas',
    categoria: 'Antihistamínicos',
    precio: 48,
  },
  // Gastrointestinales
  {
    nombre: 'Omeprazol 20 mg',
    principioActivo: 'Omeprazol',
    presentacion: 'Caja con 14 cápsulas',
    categoria: 'Gastrointestinales',
    precio: 30,
  },
  {
    nombre: 'Esomeprazol 40 mg',
    principioActivo: 'Esomeprazol',
    presentacion: 'Caja con 14 tabletas',
    categoria: 'Gastrointestinales',
    precio: 95,
  },
  {
    nombre: 'Loperamida 2 mg',
    principioActivo: 'Loperamida',
    presentacion: 'Caja con 12 tabletas',
    categoria: 'Gastrointestinales',
    precio: 18,
  },
  {
    nombre: 'Metoclopramida 10 mg',
    principioActivo: 'Metoclopramida',
    presentacion: 'Caja con 20 tabletas',
    categoria: 'Gastrointestinales',
    precio: 20,
  },
  {
    nombre: 'Sales de rehidratación oral',
    principioActivo: 'Electrolitos orales',
    presentacion: 'Sobre de 27.9 g',
    categoria: 'Gastrointestinales',
    precio: 6,
  },
  {
    nombre: 'Hidróxido de aluminio y magnesio',
    principioActivo: 'Hidróxido de aluminio, hidróxido de magnesio',
    presentacion: 'Suspensión de 360 ml',
    categoria: 'Gastrointestinales',
    precio: 38,
  },
  {
    nombre: 'Butilhioscina 10 mg',
    principioActivo: 'Butilbromuro de hioscina',
    presentacion: 'Caja con 20 grageas',
    categoria: 'Gastrointestinales',
    precio: 35,
  },
  // Cardiovasculares y metabólicos
  {
    nombre: 'Losartán 50 mg',
    principioActivo: 'Losartán potásico',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 45,
    receta: true,
  },
  {
    nombre: 'Enalapril 10 mg',
    principioActivo: 'Enalapril maleato',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 25,
    receta: true,
  },
  {
    nombre: 'Amlodipino 5 mg',
    principioActivo: 'Amlodipino',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 32,
    receta: true,
  },
  {
    nombre: 'Atorvastatina 20 mg',
    principioActivo: 'Atorvastatina cálcica',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 85,
    receta: true,
  },
  {
    nombre: 'Metformina 850 mg',
    principioActivo: 'Metformina clorhidrato',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 28,
    receta: true,
  },
  {
    nombre: 'Glibenclamida 5 mg',
    principioActivo: 'Glibenclamida',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 18,
    receta: true,
  },
  {
    nombre: 'Hidroclorotiazida 25 mg',
    principioActivo: 'Hidroclorotiazida',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Cardiovasculares y metabólicos',
    precio: 16,
    receta: true,
  },
  // Respiratorios
  {
    nombre: 'Salbutamol inhalador 100 mcg',
    principioActivo: 'Salbutamol',
    presentacion: 'Inhalador de 200 dosis',
    categoria: 'Respiratorios',
    precio: 55,
    receta: true,
  },
  {
    nombre: 'Ambroxol jarabe 30 mg/5 ml',
    principioActivo: 'Ambroxol clorhidrato',
    presentacion: 'Frasco de 120 ml',
    categoria: 'Respiratorios',
    precio: 32,
  },
  {
    nombre: 'Dextrometorfano jarabe 15 mg/5 ml',
    principioActivo: 'Dextrometorfano',
    presentacion: 'Frasco de 120 ml',
    categoria: 'Respiratorios',
    precio: 35,
  },
  // Vitaminas y suplementos
  {
    nombre: 'Complejo B',
    principioActivo: 'Tiamina, piridoxina, cianocobalamina',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Vitaminas y suplementos',
    precio: 40,
  },
  {
    nombre: 'Vitamina C 500 mg',
    principioActivo: 'Ácido ascórbico',
    presentacion: 'Frasco con 100 tabletas',
    categoria: 'Vitaminas y suplementos',
    precio: 45,
  },
  {
    nombre: 'Ácido fólico 5 mg',
    principioActivo: 'Ácido fólico',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Vitaminas y suplementos',
    precio: 15,
  },
  {
    nombre: 'Sulfato ferroso 300 mg',
    principioActivo: 'Sulfato ferroso',
    presentacion: 'Caja con 30 tabletas',
    categoria: 'Vitaminas y suplementos',
    precio: 20,
  },
  // Dermatológicos
  {
    nombre: 'Clotrimazol crema 1 %',
    principioActivo: 'Clotrimazol',
    presentacion: 'Tubo de 20 g',
    categoria: 'Dermatológicos',
    precio: 25,
  },
  {
    nombre: 'Hidrocortisona crema 1 %',
    principioActivo: 'Hidrocortisona',
    presentacion: 'Tubo de 15 g',
    categoria: 'Dermatológicos',
    precio: 28,
  },
  // Antiparasitarios
  {
    nombre: 'Albendazol 400 mg',
    principioActivo: 'Albendazol',
    presentacion: 'Caja con 1 tableta',
    categoria: 'Antiparasitarios',
    precio: 10,
  },
  {
    nombre: 'Mebendazol suspensión 100 mg/5 ml',
    principioActivo: 'Mebendazol',
    presentacion: 'Frasco de 30 ml',
    categoria: 'Antiparasitarios',
    precio: 18,
  },
];

export const PROVEEDORES: {
  nombre: string;
  nit: string;
  telefono: string;
  email: string;
  contacto: string;
  direccion: string;
}[] = [
  {
    nombre: 'Droguería Centroamericana, S.A.',
    nit: '4521873-6',
    telefono: '2385-4400',
    email: 'ventas@drogueriaca.com.gt',
    contacto: 'Julio Reyes',
    direccion: '20 calle 5-35, zona 10, Guatemala',
  },
  {
    nombre: 'Distribuidora Farmacéutica del Pacífico, S.A.',
    nit: '6874120-3',
    telefono: '2477-8800',
    email: 'pedidos@farmapacifico.com.gt',
    contacto: 'Claudia Mendoza',
    direccion: 'Calzada Aguilar Batres 34-70, zona 11, Guatemala',
  },
  {
    nombre: 'Laboratorios Genéricos de Guatemala, S.A.',
    nit: '3398215-K',
    telefono: '2366-1200',
    email: 'comercial@labgenericos.com.gt',
    contacto: 'Fernando Ortiz',
    direccion: 'Km 16.5 carretera a El Salvador, Guatemala',
  },
  {
    nombre: 'Importadora Médica Maya, S.A.',
    nit: '9012457-2',
    telefono: '2431-6600',
    email: 'servicio@medicamaya.com.gt',
    contacto: 'Lucía Samayoa',
    direccion: '7a. avenida 12-90, zona 9, Guatemala',
  },
];

/** RN-25: categorías de activos con vida útil por defecto. */
export const CATEGORIAS_ACTIVO: [nombre: string, vidaUtilMeses: number][] = [
  ['Edificios', 20 * 12],
  ['Mobiliario y equipo', 5 * 12],
  ['Vehículos', 5 * 12],
  ['Equipo de cómputo', 3 * 12],
  ['Refrigeración médica', 5 * 12],
];
