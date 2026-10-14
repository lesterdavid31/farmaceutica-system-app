// Seed de inventario: compras iniciales de la bodega con lotes que hoy están vencidos, por vencer y
// lejanos, inventario inicial de apertura en cada sucursal (hace unos 100 días) y stock mínimo. La
// operación posterior está en historia.ts. Valores reproducibles (semilla fija).
// Idempotente: si la primera compra del seed ya existe, no hace nada.

import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { TipoMovimientoInventario, TipoUbicacion } from '../../src/generated/prisma/enums';
import { hoyGuatemala, sumarDias } from '../../src/inventario/fefo';
import { PROVEEDORES, UBICACIONES } from './datos-base';

type Tx = Prisma.TransactionClient;

/** Generador pseudoaleatorio determinista (mulberry32). */
export function generador(semilla: number) {
  let estado = semilla >>> 0;
  const siguiente = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    entero: (min: number, max: number) => min + Math.floor(siguiente() * (max - min + 1)),
    decimal: (min: number, max: number) => min + siguiente() * (max - min),
  };
}

const DOCUMENTO_PRIMERA_COMPRA = 'SEED-FAC-0001';

interface LotePlan {
  productoId: string;
  numeroLote: string;
  vence: Date;
  costo: number;
  cantidadBodega: number;
  tipo: 'vencido' | 'porVencer' | 'lejano';
}

async function ingresar(
  tx: Tx,
  datos: {
    ubicacionId: string;
    loteId: string;
    cantidad: number;
    costo: number;
    tipo: TipoMovimientoInventario;
    usuarioId: string;
    fecha: Date;
    referenciaTipo: string;
    referenciaId?: string;
    motivo?: string;
  },
) {
  await tx.existencia.upsert({
    where: { ubicacionId_loteId: { ubicacionId: datos.ubicacionId, loteId: datos.loteId } },
    update: { cantidad: { increment: datos.cantidad } },
    create: { ubicacionId: datos.ubicacionId, loteId: datos.loteId, cantidad: datos.cantidad },
  });
  await tx.movimientoInventario.create({
    data: {
      tipo: datos.tipo,
      ubicacionId: datos.ubicacionId,
      loteId: datos.loteId,
      cantidad: datos.cantidad,
      costoUnitario: datos.costo,
      usuarioId: datos.usuarioId,
      referenciaTipo: datos.referenciaTipo,
      referenciaId: datos.referenciaId,
      motivo: datos.motivo,
      createdAt: datos.fecha,
    },
  });
}

export async function sembrarInventario(prisma: PrismaClient) {
  if (await prisma.compra.findFirst({ where: { numeroDocumento: DOCUMENTO_PRIMERA_COMPRA } })) {
    console.log('Inventario: ya estaba cargado, se omite');
    return;
  }
  const azar = generador(20261011);
  const hoy = hoyGuatemala();
  const enDias = (dias: number) => sumarDias(hoy, dias);
  /** Momento de un movimiento pasado, a media mañana en Guatemala (16:00 UTC). */
  const momento = (dias: number) => new Date(enDias(dias).getTime() + 16 * 3_600_000);

  const productos = await prisma.producto.findMany({ orderBy: { sku: 'asc' } });
  const proveedores = await prisma.proveedor.findMany({
    where: { nit: { in: PROVEEDORES.map((p) => p.nit) } },
    orderBy: { nit: 'asc' },
  });
  const ubicaciones = await prisma.ubicacion.findMany({
    where: { codigo: { in: UBICACIONES.map((u) => u.codigo) } },
  });
  const bodega = ubicaciones.find((u) => u.tipo === TipoUbicacion.BODEGA_CENTRAL)!;
  const sucursales = UBICACIONES.filter((u) => u.tipo !== TipoUbicacion.BODEGA_CENTRAL).map((u) =>
    ubicaciones.find((x) => x.codigo === u.codigo)!,
  );
  const usuarioDe = async (correo: string) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { email: correo } })).id;
  const gerenteBodega = await usuarioDe('gerente.bodega@farmacia.gt');

  // ─── Plan de lotes por producto ────────────────────────────────────────────
  const lotes: LotePlan[] = [];
  productos.forEach((p, i) => {
    const precio = Number(p.precioVenta);
    const costo = () => Math.round(precio * azar.decimal(0.55, 0.7) * 100) / 100;
    const prefijo = p.sku.replace('MED-', 'L');
    // Los productos con un lote ya vencido son los de baja rotación (ROTACION_BAJA en historia.ts):
    // así parte del lote se queda sin vender, como en la realidad.
    if (i % 5 === 4) {
      lotes.push({
        productoId: p.id,
        numeroLote: `${prefijo}-V${azar.entero(10, 99)}`,
        vence: enDias(-azar.entero(5, 40)),
        costo: costo(),
        cantidadBodega: azar.entero(60, 140),
        tipo: 'vencido',
      });
    }
    if (i % 3 === 0) {
      lotes.push({
        productoId: p.id,
        numeroLote: `${prefijo}-P${azar.entero(10, 99)}`,
        vence: enDias(azar.entero(15, 80)),
        costo: costo(),
        cantidadBodega: azar.entero(80, 200),
        tipo: 'porVencer',
      });
    }
    lotes.push({
      productoId: p.id,
      numeroLote: `${prefijo}-A${azar.entero(10, 99)}`,
      vence: enDias(azar.entero(300, 720)),
      costo: costo(),
      cantidadBodega: azar.entero(250, 600),
      tipo: 'lejano',
    });
  });

  // Las tres compras iniciales son anteriores a la apertura de las sucursales.
  const compras = [
    { documento: DOCUMENTO_PRIMERA_COMPRA, dias: -120, tipos: ['vencido'] },
    { documento: 'SEED-FAC-0002', dias: -112, tipos: ['porVencer'] },
    { documento: 'SEED-FAC-0003', dias: -105, tipos: ['lejano'] },
  ] as const;

  const loteIds = new Map<string, string>();
  for (const [n, compra] of compras.entries()) {
    const planes = lotes.filter((l) => (compra.tipos as readonly string[]).includes(l.tipo));
    const proveedor = proveedores[n % proveedores.length];
    const total = planes.reduce((s, l) => s + l.costo * l.cantidadBodega, 0);
    await prisma.$transaction(
      async (tx) => {
        const registro = await tx.compra.create({
          data: {
            proveedorId: proveedor.id,
            ubicacionId: bodega.id,
            numeroDocumento: compra.documento,
            fecha: enDias(compra.dias),
            total: Math.round(total * 100) / 100,
            usuarioId: gerenteBodega,
            observaciones: 'Compra de abastecimiento (datos de demostración)',
            createdAt: momento(compra.dias),
          },
        });
        for (const plan of planes) {
          const lote = await tx.lote.create({
            data: {
              productoId: plan.productoId,
              numeroLote: plan.numeroLote,
              fechaVencimiento: plan.vence,
              costoUnitario: plan.costo,
              proveedorId: proveedor.id,
              createdAt: momento(compra.dias),
            },
          });
          loteIds.set(plan.numeroLote, lote.id);
          await tx.detalleCompra.create({
            data: {
              compraId: registro.id,
              productoId: plan.productoId,
              loteId: lote.id,
              cantidad: plan.cantidadBodega,
              costoUnitario: plan.costo,
              subtotal: Math.round(plan.costo * plan.cantidadBodega * 100) / 100,
            },
          });
          await ingresar(tx, {
            ubicacionId: bodega.id,
            loteId: lote.id,
            cantidad: plan.cantidadBodega,
            costo: plan.costo,
            tipo: TipoMovimientoInventario.COMPRA,
            usuarioId: gerenteBodega,
            fecha: momento(compra.dias),
            referenciaTipo: 'COMPRA',
            referenciaId: registro.id,
          });
        }
      },
      { maxWait: 20_000, timeout: 120_000 },
    );
  }

  // ─── Inventario inicial de apertura en cada sucursal ───────────────────────
  // Cada sucursal carece de algunos productos (para demostrar la sugerencia de traslado del
  // call center) y algunos productos especializados solo están en la bodega y en Xela.
  const soloBodegaYXela = new Set(['MED-0014', 'MED-0022', 'MED-0031']);
  for (const [k, sucursal] of sucursales.entries()) {
    const slug = UBICACIONES.find((u) => u.codigo === sucursal.codigo)!.slug;
    const gerente = await usuarioDe(`gerente.${slug}@farmacia.gt`);
    const diasApertura = -100 + k;
    await prisma.$transaction(
      async (tx) => {
        for (const [j, producto] of productos.entries()) {
          if ((j + k) % 4 === 0) {
            continue;
          }
          if (soloBodegaYXela.has(producto.sku) && sucursal.codigo !== 'CC-XELA') {
            continue;
          }
          for (const plan of lotes.filter((l) => l.productoId === producto.id)) {
            const cantidad =
              plan.tipo === 'lejano'
                ? azar.entero(20, 60)
                : plan.tipo === 'porVencer'
                  ? azar.entero(4, 15)
                  : (j + k) % 3 !== 2
                    ? azar.entero(8, 20)
                    : 0;
            if (cantidad === 0) {
              continue;
            }
            await ingresar(tx, {
              ubicacionId: sucursal.id,
              loteId: loteIds.get(plan.numeroLote)!,
              cantidad,
              costo: plan.costo,
              tipo: TipoMovimientoInventario.AJUSTE,
              usuarioId: gerente,
              fecha: momento(diasApertura),
              referenciaTipo: 'APERTURA',
              motivo: 'Inventario inicial de apertura de la sucursal',
            });
          }
        }
        // Stock mínimo para los productos de mayor rotación.
        for (const producto of productos.slice(0, 12)) {
          await tx.stockMinimo.upsert({
            where: {
              ubicacionId_productoId: { ubicacionId: sucursal.id, productoId: producto.id },
            },
            update: {},
            create: {
              ubicacionId: sucursal.id,
              productoId: producto.id,
              cantidadMinima: azar.entero(15, 40),
            },
          });
        }
      },
      { maxWait: 20_000, timeout: 120_000 },
    );
  }

  const resumen = await prisma.existencia.aggregate({ _sum: { cantidad: true }, _count: true });
  console.log(
    `Inventario: ${lotes.length} lotes, ${resumen._count} existencias, ${resumen._sum.cantidad} unidades`,
  );
}
