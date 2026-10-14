// Seed idempotente: se puede ejecutar varias veces sin duplicar datos (todo es upsert).
// Uso: npm run seed -w @farmacia/backend

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { Rol } from '../src/generated/prisma/enums';
import { PARAMETROS } from '../src/configuracion/parametros';
import {
  CATEGORIAS,
  CATEGORIAS_ACTIVO,
  DEPARTAMENTOS,
  MUNICIPIOS,
  PASSWORD_DEMO,
  PRODUCTOS,
  PROVEEDORES,
  UBICACIONES,
  USUARIOS_GLOBALES,
} from './seed/datos-base';
import { sembrarInventario } from './seed/inventario';
import { sembrarTraslados } from './seed/traslados';
import { sembrarVentas } from './seed/ventas';
import { sembrarPedidos } from './seed/pedidos';
import { sembrarPlanillaYActivos } from './seed/planilla-activos';

config({ quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Defina DIRECT_URL o DATABASE_URL en apps/backend/.env');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function geografia() {
  const departamentos = new Map<string, string>();
  for (const [codigo, nombre] of DEPARTAMENTOS) {
    const d = await prisma.departamento.upsert({
      where: { codigo },
      update: { nombre },
      create: { codigo, nombre },
    });
    departamentos.set(nombre, d.id);
  }
  const municipios = new Map<string, string>();
  for (const [departamento, nombre] of MUNICIPIOS) {
    const departamentoId = departamentos.get(departamento)!;
    const m = await prisma.municipio.upsert({
      where: { departamentoId_nombre: { departamentoId, nombre } },
      update: {},
      create: { departamentoId, nombre },
    });
    municipios.set(`${departamento}/${nombre}`, m.id);
  }
  return municipios;
}

async function ubicaciones(municipios: Map<string, string>) {
  const ids = new Map<string, string>();
  for (const u of UBICACIONES) {
    const datos = {
      nombre: u.nombre,
      tipo: u.tipo,
      direccion: u.direccion,
      municipioId: municipios.get(`${u.departamento}/${u.municipio}`)!,
      latitud: u.latitud,
      longitud: u.longitud,
      telefono: u.telefono,
    };
    const ubicacion = await prisma.ubicacion.upsert({
      where: { codigo: u.codigo },
      update: datos,
      create: { codigo: u.codigo, ...datos },
    });
    ids.set(u.codigo, ubicacion.id);
  }
  return ids;
}

async function usuarios(ubicacionIds: Map<string, string>) {
  // Una sola vez: bcrypt es lento a propósito. En re-ejecuciones no se cambia la contraseña.
  const passwordHash = await hash(PASSWORD_DEMO, 10);
  const guardar = (email: string, nombre: string, rol: Rol, ubicacionId: string | null) =>
    prisma.usuario.upsert({
      where: { email },
      update: { nombre, rol, ubicacionId },
      create: { email, nombre, rol, ubicacionId, passwordHash },
    });

  for (const u of USUARIOS_GLOBALES) {
    await guardar(u.email, u.nombre, u.rol, null);
  }
  for (const u of UBICACIONES) {
    const ubicacionId = ubicacionIds.get(u.codigo)!;
    await guardar(`gerente.${u.slug}@farmacia.gt`, u.responsable.gerente, Rol.GERENTE, ubicacionId);
    if (u.responsable.cajero) {
      await guardar(`cajero.${u.slug}@farmacia.gt`, u.responsable.cajero, Rol.CAJERO, ubicacionId);
    }
  }
}

async function catalogo() {
  const categorias = new Map<string, string>();
  for (const [nombre, descripcion] of CATEGORIAS) {
    const c = await prisma.categoria.upsert({
      where: { nombre },
      update: { descripcion },
      create: { nombre, descripcion },
    });
    categorias.set(nombre, c.id);
  }
  for (const [i, p] of PRODUCTOS.entries()) {
    const sku = `MED-${String(i + 1).padStart(4, '0')}`;
    const datos = {
      nombre: p.nombre,
      principioActivo: p.principioActivo,
      presentacion: p.presentacion,
      categoriaId: categorias.get(p.categoria)!,
      precioVenta: p.precio,
      requiereReceta: p.receta ?? false,
    };
    await prisma.producto.upsert({ where: { sku }, update: datos, create: { sku, ...datos } });
  }
  for (const p of PROVEEDORES) {
    await prisma.proveedor.upsert({ where: { nit: p.nit }, update: p, create: p });
  }
  for (const [nombre, vidaUtilMeses] of CATEGORIAS_ACTIVO) {
    await prisma.categoriaActivo.upsert({
      where: { nombre },
      update: {},
      create: { nombre, vidaUtilMeses },
    });
  }
}

async function configuracion() {
  for (const [clave, p] of Object.entries(PARAMETROS)) {
    await prisma.configuracion.upsert({
      where: { clave },
      update: {},
      create: { clave, valor: String(p.porDefecto), descripcion: p.descripcion },
    });
  }
}

async function main() {
  const inicio = Date.now();
  const municipios = await geografia();
  const ubicacionIds = await ubicaciones(municipios);
  await usuarios(ubicacionIds);
  await catalogo();
  await configuracion();
  await sembrarInventario(prisma);
  await sembrarTraslados(prisma);
  await sembrarVentas(prisma);
  await sembrarPedidos(prisma);
  await sembrarPlanillaYActivos(prisma);

  const conteo = {
    departamentos: await prisma.departamento.count(),
    municipios: await prisma.municipio.count(),
    ubicaciones: await prisma.ubicacion.count(),
    usuarios: await prisma.usuario.count(),
    productos: await prisma.producto.count(),
    proveedores: await prisma.proveedor.count(),
  };
  console.log(`Seed completado en ${((Date.now() - inicio) / 1000).toFixed(1)} s`, conteo);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
