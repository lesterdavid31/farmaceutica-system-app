/**
 * Criterio de la fase 2: pruebas de FEFO, no negativos y vencidos contra la base de datos real.
 *
 * Las pruebas que escriben corren dentro de una transacción que se revierte al final: como el
 * kardex es inmutable, así no quedan datos de prueba. Las invariantes revisan toda la base.
 * Requieren la base de apps/backend/.env con el seed aplicado (npm run seed).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { Prisma } from '../src/generated/prisma/client';
import { TipoMovimientoInventario } from '../src/generated/prisma/enums';
import { hoyGuatemala, sumarDias } from '../src/inventario/fefo';
import { MotorInventarioService, Tx } from '../src/inventario/motor-inventario.service';
import { PrismaService } from '../src/prisma/prisma.service';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';

class Revertir extends Error {}

describe('Inventario (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let motor: MotorInventarioService;
  let usuarioId: string;
  let xelaId: string;
  let bodegaId: string;
  let categoriaId: string;
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const como = (cuenta: string) => ({ Authorization: `Bearer ${tokens[cuenta]}` });

  /** Ejecuta `fn` en una transacción y la revierte siempre. */
  async function revertida(fn: (tx: Tx) => Promise<void>) {
    await prisma
      .$transaction(
        async (tx) => {
          await fn(tx);
          throw new Revertir();
        },
        { maxWait: 15_000, timeout: 60_000 },
      )
      .catch((error: unknown) => {
        if (!(error instanceof Revertir)) {
          throw error;
        }
      });
  }

  /** Producto de prueba con un lote vencido (50), uno por vencer (10) y uno lejano (20) en Xela. */
  async function escenario(tx: Tx) {
    const hoy = hoyGuatemala();
    const sku = `PRUEBA-${Date.now()}`;
    const producto = await tx.producto.create({
      data: {
        sku,
        nombre: 'Amoxicilina 500 mg (prueba)',
        principioActivo: 'Amoxicilina',
        presentacion: 'Caja',
        categoriaId,
        precioVenta: 45,
      },
    });
    const crearLote = (numeroLote: string, dias: number) =>
      tx.lote.create({
        data: {
          productoId: producto.id,
          numeroLote,
          fechaVencimiento: sumarDias(hoy, dias),
          costoUnitario: 20,
        },
      });
    const vencido = await crearLote('T-VENCIDO', -3);
    const pronto = await crearLote('T-PRONTO', 30);
    const lejano = await crearLote('T-LEJANO', 400);
    // Se ingresan en un orden distinto al de vencimiento para probar que FEFO no depende de él.
    for (const [lote, cantidad] of [
      [lejano, 20],
      [vencido, 50],
      [pronto, 10],
    ] as const) {
      await motor.ingresar(tx, {
        ubicacionId: xelaId,
        loteId: lote.id,
        cantidad,
        tipo: TipoMovimientoInventario.AJUSTE,
        motivo: 'Prueba',
        usuarioId,
      });
    }
    const existencia = async (loteId: string) =>
      (
        await tx.existencia.findUniqueOrThrow({
          where: { ubicacionId_loteId: { ubicacionId: xelaId, loteId } },
        })
      ).cantidad;
    return { producto, vencido, pronto, lejano, existencia };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    motor = app.get(MotorInventarioService);

    usuarioId = (await prisma.usuario.findUniqueOrThrow({ where: { email: 'admin@farmacia.gt' } }))
      .id;
    xelaId = (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'CC-XELA' } })).id;
    bodegaId = (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'BOD-CENTRAL' } })).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;

    for (const cuenta of ['admin', 'auditor', 'gerente.xela', 'cajero.xela', 'gerente.bodega']) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: `${cuenta}@farmacia.gt`, password: PASSWORD });
      tokens[cuenta] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('FEFO (RN-02)', () => {
    it('descuenta primero el lote que vence antes y reparte entre lotes', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const asignados = await motor.descontarFefo(tx, {
          ubicacionId: xelaId,
          productoId: e.producto.id,
          cantidad: 15,
          tipo: TipoMovimientoInventario.VENTA,
          usuarioId,
        });
        expect(asignados.map((a) => [a.numeroLote, a.cantidad])).toEqual([
          ['T-PRONTO', 10],
          ['T-LEJANO', 5],
        ]);
        expect(await e.existencia(e.pronto.id)).toBe(0);
        expect(await e.existencia(e.lejano.id)).toBe(15);
        expect(await e.existencia(e.vencido.id)).toBe(50);
      });
    });

    it('registra en el kardex un movimiento negativo por cada lote usado', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await motor.descontarFefo(tx, {
          ubicacionId: xelaId,
          productoId: e.producto.id,
          cantidad: 12,
          tipo: TipoMovimientoInventario.VENTA,
          referenciaTipo: 'VENTA',
          usuarioId,
        });
        const salidas = await tx.movimientoInventario.findMany({
          where: { lote: { productoId: e.producto.id }, tipo: TipoMovimientoInventario.VENTA },
          include: { lote: true },
          orderBy: { cantidad: 'asc' },
        });
        expect(salidas.map((m) => [m.lote.numeroLote, m.cantidad])).toEqual([
          ['T-PRONTO', -10],
          ['T-LEJANO', -2],
        ]);
        expect(salidas.every((m) => m.costoUnitario.equals(new Prisma.Decimal(20)))).toBe(true);
      });
    });
  });

  describe('Vencidos (RN-03)', () => {
    it('nunca usa el lote vencido aunque tenga más unidades', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          motor.descontarFefo(tx, {
            ubicacionId: xelaId,
            productoId: e.producto.id,
            cantidad: 31,
            tipo: TipoMovimientoInventario.VENTA,
            usuarioId,
          }),
        ).rejects.toThrow(
          'No hay existencia suficiente: quedan 30 unidades vigentes de Amoxicilina 500 mg (prueba)',
        );
      });
    });

    it('rechaza vender o trasladar un lote vencido elegido directamente', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          motor.descontarLote(tx, {
            ubicacionId: xelaId,
            loteId: e.vencido.id,
            cantidad: 1,
            tipo: TipoMovimientoInventario.TRASLADO_SALIDA,
            usuarioId,
          }),
        ).rejects.toThrow('El lote T-VENCIDO de Amoxicilina 500 mg (prueba) está vencido');
      });
    });

    it('la baja por vencimiento sí puede retirar el lote vencido', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await motor.descontarLote(tx, {
          ubicacionId: xelaId,
          loteId: e.vencido.id,
          cantidad: 50,
          tipo: TipoMovimientoInventario.BAJA_VENCIMIENTO,
          permitirVencido: true,
          usuarioId,
        });
        expect(await e.existencia(e.vencido.id)).toBe(0);
      });
    });
  });

  describe('No negativos (RN-01)', () => {
    it('rechaza descontar de un lote más de lo que tiene', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          motor.descontarLote(tx, {
            ubicacionId: xelaId,
            loteId: e.pronto.id,
            cantidad: 11,
            tipo: TipoMovimientoInventario.AJUSTE,
            usuarioId,
          }),
        ).rejects.toThrow('el lote T-PRONTO de Amoxicilina 500 mg (prueba) tiene 10 unidades');
        expect(await e.existencia(e.pronto.id)).toBe(10);
      });
    });

    it('agotar un lote lo deja en cero, nunca en negativo', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await motor.descontarFefo(tx, {
          ubicacionId: xelaId,
          productoId: e.producto.id,
          cantidad: 30,
          tipo: TipoMovimientoInventario.VENTA,
          usuarioId,
        });
        expect(await e.existencia(e.pronto.id)).toBe(0);
        expect(await e.existencia(e.lejano.id)).toBe(0);
        await expect(
          motor.descontarFefo(tx, {
            ubicacionId: xelaId,
            productoId: e.producto.id,
            cantidad: 1,
            tipo: TipoMovimientoInventario.VENTA,
            usuarioId,
          }),
        ).rejects.toThrow('No hay existencia vigente de Amoxicilina 500 mg (prueba)');
      });
    });

    it('la base de datos rechaza una existencia negativa aunque el código fallara (CHECK)', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          tx.existencia.update({
            where: { ubicacionId_loteId: { ubicacionId: xelaId, loteId: e.pronto.id } },
            data: { cantidad: -1 },
          }),
        ).rejects.toThrow(/existencia_cantidad_no_negativa|check constraint/i);
      });
    });
  });

  describe('Invariantes de toda la base de datos', () => {
    it('ninguna existencia es negativa', async () => {
      expect(await prisma.existencia.count({ where: { cantidad: { lt: 0 } } })).toBe(0);
    });

    it('el kardex suma exactamente la existencia de cada lote en cada ubicación (RN-06)', async () => {
      const diferencias = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM (
          SELECT COALESCE(e.ubicacion_id, m.ubicacion_id) AS u, COALESCE(e.lote_id, m.lote_id) AS l,
                 COALESCE(e.cantidad, 0) AS existencia, COALESCE(m.suma, 0) AS kardex
          FROM existencia e
          FULL JOIN (
            SELECT ubicacion_id, lote_id, SUM(cantidad) AS suma
            FROM movimiento_inventario GROUP BY ubicacion_id, lote_id
          ) m ON m.ubicacion_id = e.ubicacion_id AND m.lote_id = e.lote_id
        ) x WHERE existencia <> kardex`;
      expect(Number(diferencias[0].n)).toBe(0);
    });

    it('ningún lote se vendió ni se trasladó después de vencer (RN-03)', async () => {
      const salidas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM movimiento_inventario m JOIN lote l ON l.id = m.lote_id
        WHERE m.tipo IN ('VENTA', 'TRASLADO_SALIDA')
          AND (m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guatemala')::date > l.fecha_vencimiento`;
      expect(Number(salidas[0].n)).toBe(0);
    });
  });

  describe('API de inventario: permisos y validaciones', () => {
    it('el cajero consulta las existencias de su sucursal con desglose por lote', async () => {
      const res = await http()
        .get(`${API}/inventario/existencias?conExistencia=true`)
        .set(como('cajero.xela'));
      expect(res.status).toBe(200);
      const cuerpo = res.body as {
        ubicacionId: string;
        total: number;
        data: { vigente: number; lotes: { ubicacionId: string; vigencia: string }[] }[];
      };
      expect(cuerpo.ubicacionId).toBe(xelaId);
      expect(cuerpo.total).toBeGreaterThan(0);
      expect(cuerpo.data.flatMap((p) => p.lotes).every((l) => l.ubicacionId === xelaId)).toBe(true);
    });

    it('el gerente no puede consultar otra sucursal', async () => {
      await http()
        .get(`${API}/inventario/existencias?ubicacionId=${bodegaId}`)
        .set(como('gerente.xela'))
        .expect(403);
    });

    it('el stock global de un producto incluye todas las ubicaciones activas (RF-06)', async () => {
      const producto = await prisma.producto.findFirstOrThrow({ where: { sku: 'MED-0001' } });
      const res = await http()
        .get(`${API}/inventario/productos/${producto.id}/stock`)
        .set(como('cajero.xela'))
        .expect(200);
      expect((res.body as { ubicaciones: unknown[] }).ubicaciones).toHaveLength(
        await prisma.ubicacion.count({ where: { activa: true } }),
      );
    });

    it('el kardex muestra el saldo después de cada movimiento', async () => {
      const producto = await prisma.producto.findFirstOrThrow({ where: { sku: 'MED-0001' } });
      const res = await http()
        .get(`${API}/inventario/kardex?productoId=${producto.id}&ubicacionId=${bodegaId}&limit=100`)
        .set(como('auditor'))
        .expect(200);
      const movimientos = (res.body as { data: { cantidad: number; saldo: number }[] }).data;
      expect(movimientos.length).toBeGreaterThan(0);
      // Del más reciente al más antiguo: saldo anterior = saldo actual − cantidad actual.
      for (let i = 0; i < movimientos.length - 1; i++) {
        expect(movimientos[i + 1].saldo).toBe(movimientos[i].saldo - movimientos[i].cantidad);
      }
    });

    it.each([
      ['cajero.xela', 'post', '/inventario/ajustes', 403],
      ['auditor', 'post', '/inventario/ajustes', 403],
      ['cajero.xela', 'post', '/inventario/bajas', 403],
      ['cajero.xela', 'get', '/inventario/kardex', 403],
      ['cajero.xela', 'get', '/inventario/alertas', 403],
      ['auditor', 'post', '/compras', 403],
      ['cajero.xela', 'get', '/compras', 403],
    ] as const)('%s → %s %s responde %i', async (cuenta, metodo, ruta, estado) => {
      await http()[metodo](`${API}${ruta}`).set(como(cuenta)).send({}).expect(estado);
    });

    it('el gerente de sucursal no puede ajustar el inventario de la bodega', async () => {
      const lote = await prisma.existencia.findFirstOrThrow({ where: { ubicacionId: bodegaId } });
      await http()
        .post(`${API}/inventario/ajustes`)
        .set(como('gerente.xela'))
        .send({
          ubicacionId: bodegaId,
          loteId: lote.loteId,
          cantidad: -1,
          motivo: 'Prueba de permisos',
        })
        .expect(403);
    });

    it('el ajuste exige motivo y una cantidad distinta de cero', async () => {
      const res = await http()
        .post(`${API}/inventario/ajustes`)
        .set(como('gerente.xela'))
        .send({ ubicacionId: xelaId, loteId: xelaId, cantidad: 0, motivo: 'x' })
        .expect(400);
      expect((res.body as { detalles: string[] }).detalles).toEqual(
        expect.arrayContaining([
          'La cantidad del ajuste no puede ser cero',
          'Explique el motivo del ajuste (mínimo 5 caracteres)',
        ]),
      );
    });

    it('no permite dar de baja un lote que todavía no vence', async () => {
      const vigente = await prisma.existencia.findFirstOrThrow({
        where: {
          ubicacionId: xelaId,
          cantidad: { gt: 0 },
          lote: { fechaVencimiento: { gt: hoyGuatemala() } },
        },
      });
      const res = await http()
        .post(`${API}/inventario/bajas`)
        .set(como('gerente.xela'))
        .send({ ubicacionId: xelaId, loteId: vigente.loteId })
        .expect(422);
      expect((res.body as { message: string }).message).toMatch(/todavía no vence/);
    });

    it('solo la bodega central registra compras', async () => {
      const res = await http()
        .post(`${API}/compras`)
        .set(como('gerente.xela'))
        .send({
          proveedorId: xelaId,
          detalles: [
            {
              productoId: xelaId,
              numeroLote: 'X1',
              fechaVencimiento: '2030-01-01',
              cantidad: 1,
              costoUnitario: 1,
            },
          ],
        })
        .expect(422);
      expect((res.body as { message: string }).message).toMatch(/Solo la bodega central/);
    });

    it('rechaza comprar un lote vencido', async () => {
      const proveedor = await prisma.proveedor.findFirstOrThrow({ where: { activo: true } });
      const producto = await prisma.producto.findFirstOrThrow({ where: { activo: true } });
      const res = await http()
        .post(`${API}/compras`)
        .set(como('gerente.bodega'))
        .send({
          proveedorId: proveedor.id,
          detalles: [
            {
              productoId: producto.id,
              numeroLote: 'VENCIDO-1',
              fechaVencimiento: '2020-01-01',
              cantidad: 5,
              costoUnitario: 10,
            },
          ],
        })
        .expect(422);
      expect((res.body as { detalles: string[] }).detalles[0]).toMatch(/ya está vencido/);
    });

    it('las alertas incluyen lotes vencidos y próximos a vencer del seed', async () => {
      const res = await http().get(`${API}/inventario/alertas`).set(como('admin')).expect(200);
      const cuerpo = res.body as { diasAlerta: number; vencidos: unknown[]; porVencer: unknown[] };
      expect(cuerpo.diasAlerta).toBe(90);
      expect(cuerpo.vencidos.length).toBeGreaterThan(0);
      expect(cuerpo.porVencer.length).toBeGreaterThan(0);
    });
  });
});
