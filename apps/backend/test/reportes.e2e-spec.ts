/**
 * Criterio de la fase 7: los indicadores coinciden con los datos del seed.
 *
 * Cada indicador se recalcula aquí por un camino independiente (consultas simples de Prisma y
 * sumas en JavaScript) y se compara con lo que devuelve la API, que agrega en SQL. Solo lee.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { calcularDepreciacion } from '../src/activos/depreciacion';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { hoyGuatemala, sumarDias } from '../src/inventario/fefo';
import { estaAtrasado } from '../src/pedidos/reglas-pedido';
import { PrismaService } from '../src/prisma/prisma.service';
import { inicioDelDia, periodosActuales } from '../src/reportes/fechas';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';
const q = (n: unknown) => Number(n).toFixed(2);
const suma = (xs: { toString(): string }[]) => xs.reduce<number>((s, x) => s + Number(x), 0);

interface Dashboard {
  ventas: Record<'hoy' | 'mes' | 'anio', { total: string; cantidad: number }>;
  ventasPorDia: { dia: string; total: string; ventas: number }[];
  flujoPorSucursal: {
    ubicacion: { id: string; nombre: string };
    totalVentas: string;
    porMetodo: Record<string, string>;
  }[];
  pedidosAtrasados: { total: number };
  alertas: { vencidos: number; porVencer: number; bajoMinimo: number };
  inventario: { valorCosto: string; unidades: number };
  activos: { cantidad: number; valorEnLibros: string };
  planilla: {
    ultimoCierre: { anio: number; mes: number; total: string; planillas: number } | null;
  };
}

describe('Dashboards y reportes de auditoría (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const como = (cuenta: string) => ({ Authorization: `Bearer ${tokens[cuenta]}` });
  const p = periodosActuales();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const cuenta of ['admin', 'auditor', 'gerente.escuintla', 'cajero.xela', 'operador']) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: `${cuenta}@farmacia.gt`, password: PASSWORD });
      tokens[cuenta] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Dashboard ejecutivo (RF-32)', () => {
    let d: Dashboard;
    beforeAll(async () => {
      d = (await http().get(`${API}/reportes/dashboard`).set(como('auditor')).expect(200))
        .body as Dashboard;
    });

    it('las ventas del día, del mes y del año coinciden con las ventas completadas', async () => {
      const ventas = await prisma.venta.findMany({
        where: { estado: 'COMPLETADA', createdAt: { gte: p.inicioAnio } },
        select: { total: true, createdAt: true },
      });
      const desde = (inicio: Date) => ventas.filter((v) => v.createdAt >= inicio);
      expect(q(d.ventas.anio.total)).toBe(q(suma(ventas.map((v) => v.total))));
      expect(d.ventas.anio.cantidad).toBe(ventas.length);
      expect(q(d.ventas.mes.total)).toBe(q(suma(desde(p.inicioMes).map((v) => v.total))));
      expect(q(d.ventas.hoy.total)).toBe(q(suma(desde(p.inicioHoy).map((v) => v.total))));
      // El seed tiene ventas este año.
      expect(d.ventas.anio.cantidad).toBeGreaterThan(0);
    });

    it('las ventas por día suman lo vendido en los últimos 30 días, sin días faltantes', async () => {
      expect(d.ventasPorDia).toHaveLength(30);
      expect(d.ventasPorDia.at(-1)?.dia.slice(0, 10)).toBe(p.hoy.toISOString().slice(0, 10));
      const ventas = await prisma.venta.findMany({
        where: { estado: 'COMPLETADA', createdAt: { gte: inicioDelDia(sumarDias(p.hoy, -29)) } },
        select: { total: true },
      });
      expect(q(suma(d.ventasPorDia.map((x) => x.total)))).toBe(q(suma(ventas.map((v) => v.total))));
    });

    it('el flujo del mes por sucursal y método coincide con los movimientos de caja', async () => {
      const movimientos = await prisma.movimientoCaja.findMany({
        where: {
          tipo: { in: ['VENTA', 'COBRO_CONTRA_ENTREGA', 'ANULACION'] },
          createdAt: { gte: p.inicioMes },
        },
        select: { monto: true, metodoPago: true, turnoCaja: { select: { ubicacionId: true } } },
      });
      for (const fila of d.flujoPorSucursal) {
        for (const metodo of ['EFECTIVO', 'TARJETA', 'CONTRA_ENTREGA']) {
          const esperado = suma(
            movimientos
              .filter(
                (m) => m.turnoCaja.ubicacionId === fila.ubicacion.id && m.metodoPago === metodo,
              )
              .map((m) => m.monto),
          );
          expect(`${fila.ubicacion.nombre} ${metodo} ${q(fila.porMetodo[metodo])}`).toBe(
            `${fila.ubicacion.nombre} ${metodo} ${q(esperado)}`,
          );
        }
      }
      const ventasMes = await prisma.venta.groupBy({
        by: ['ubicacionId'],
        where: { estado: 'COMPLETADA', createdAt: { gte: p.inicioMes } },
        _sum: { total: true },
      });
      for (const v of ventasMes) {
        const fila = d.flujoPorSucursal.find((f) => f.ubicacion.id === v.ubicacionId);
        expect(q(fila?.totalVentas)).toBe(q(v._sum.total));
      }
    });

    it('cuenta los pedidos atrasados y las alertas de inventario', async () => {
      const pedidos = await prisma.pedido.findMany({
        select: { estado: true, fechaCompromiso: true },
      });
      const ahora = new Date();
      expect(d.pedidosAtrasados.total).toBe(pedidos.filter((x) => estaAtrasado(x, ahora)).length);

      const hoy = hoyGuatemala();
      const vencidos = await prisma.existencia.count({
        where: { cantidad: { gt: 0 }, lote: { fechaVencimiento: { lt: hoy } } },
      });
      expect(d.alertas.vencidos).toBe(vencidos);
      // El seed carga lotes vencidos y por vencer a propósito.
      expect(d.alertas.vencidos).toBeGreaterThan(0);
      expect(d.alertas.porVencer).toBeGreaterThan(0);
    });

    it('el valor del inventario a costo es la suma de existencia × costo del lote', async () => {
      const existencias = await prisma.existencia.findMany({
        where: { cantidad: { gt: 0 } },
        select: { cantidad: true, lote: { select: { costoUnitario: true } } },
      });
      expect(q(d.inventario.valorCosto)).toBe(
        q(existencias.reduce((s, e) => s + e.cantidad * Number(e.lote.costoUnitario), 0)),
      );
      expect(d.inventario.unidades).toBe(existencias.reduce((s, e) => s + e.cantidad, 0));
    });

    it('el valor de los activos es la suma de sus valores en libros a hoy', async () => {
      const activos = await prisma.activoFijo.findMany({
        where: { activo: true, fechaAdquisicion: { lte: p.hoy } },
      });
      expect(d.activos.cantidad).toBe(activos.length);
      expect(q(d.activos.valorEnLibros)).toBe(
        q(suma(activos.map((a) => calcularDepreciacion(a, p.hoy).valorEnLibros))),
      );
      // Seed: 30 activos (si nadie dio de baja alguno desde entonces).
      expect(d.activos.cantidad).toBeGreaterThanOrEqual(29);
    });

    it('el gasto en planilla es el total del último mes cerrado', async () => {
      const ultimo = d.planilla.ultimoCierre!;
      const planillas = await prisma.planilla.findMany({
        where: { anio: ultimo.anio, mes: ultimo.mes, estado: 'CERRADA' },
        select: { total: true },
      });
      expect(ultimo.planillas).toBe(planillas.length);
      expect(q(ultimo.total)).toBe(q(suma(planillas.map((x) => x.total))));
      // El seed cerró agosto y septiembre de 2026 en las 9 ubicaciones.
      expect(ultimo.anio * 12 + ultimo.mes).toBeGreaterThanOrEqual(2026 * 12 + 9);
    });
  });

  describe('Dashboard de sucursal (RF-37)', () => {
    it('el gerente ve los mismos indicadores limitados a su ubicación', async () => {
      const escuintla = await prisma.ubicacion.findUniqueOrThrow({
        where: { codigo: 'CC-ESCUINTLA' },
      });
      const d = (
        await http().get(`${API}/reportes/dashboard`).set(como('gerente.escuintla')).expect(200)
      ).body as Dashboard & { ubicacionId: string };
      expect(d.ubicacionId).toBe(escuintla.id);
      expect(d.flujoPorSucursal.map((f) => f.ubicacion.id)).toEqual([escuintla.id]);
      const ventas = await prisma.venta.aggregate({
        where: {
          estado: 'COMPLETADA',
          ubicacionId: escuintla.id,
          createdAt: { gte: p.inicioAnio },
        },
        _sum: { total: true },
      });
      expect(q(d.ventas.anio.total)).toBe(q(ventas._sum.total));
      const activos = await prisma.activoFijo.findMany({
        where: { activo: true, ubicacionId: escuintla.id, fechaAdquisicion: { lte: p.hoy } },
      });
      expect(q(d.activos.valorEnLibros)).toBe(
        q(suma(activos.map((a) => calcularDepreciacion(a, p.hoy).valorEnLibros))),
      );
      // Pedir otra ubicación es un 403.
      const xela = await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'CC-XELA' } });
      await http()
        .get(`${API}/reportes/dashboard?ubicacionId=${xela.id}`)
        .set(como('gerente.escuintla'))
        .expect(403);
    });
  });

  describe('Flujo de efectivo (RF-33)', () => {
    const desde = '2026-10-01';
    const hasta = () => hoyGuatemala().toISOString().slice(0, 10);

    it('ingresos, egresos y diferencias de arqueo coinciden con caja y turnos', async () => {
      const r = (
        await http()
          .get(`${API}/reportes/flujo-efectivo?desde=${desde}&hasta=${hasta()}`)
          .set(como('auditor'))
          .expect(200)
      ).body as {
        consolidado: Record<string, string | number | Record<string, string>>;
        porSucursal: { ubicacion: { id: string }; netoEfectivo: string; faltantes: string }[];
        turnos: { diferencia: string | null; ubicacion: { nombre: string } }[];
      };
      const inicio = inicioDelDia(new Date(`${desde}T00:00:00Z`));
      const fin = inicioDelDia(sumarDias(hoyGuatemala(), 1));
      const movimientos = await prisma.movimientoCaja.findMany({
        where: { createdAt: { gte: inicio, lt: fin } },
        select: {
          tipo: true,
          metodoPago: true,
          monto: true,
          turnoCaja: { select: { ubicacionId: true } },
        },
      });
      const de = (cond: (m: (typeof movimientos)[number]) => boolean) =>
        suma(movimientos.filter(cond).map((m) => m.monto));
      expect(q(r.consolidado.gastos)).toBe(q(-de((m) => m.tipo === 'GASTO')));
      expect(q(r.consolidado.retiros)).toBe(q(-de((m) => m.tipo === 'RETIRO')));
      expect(q(r.consolidado.depositos)).toBe(q(de((m) => m.tipo === 'DEPOSITO')));
      const ingresos = r.consolidado.ingresos as Record<string, string>;
      expect(q(ingresos.TARJETA)).toBe(
        q(
          de(
            (m) =>
              m.metodoPago === 'TARJETA' &&
              ['VENTA', 'COBRO_CONTRA_ENTREGA', 'ANULACION'].includes(m.tipo),
          ),
        ),
      );
      // El neto de efectivo de cada sucursal es la suma de sus movimientos en efectivo.
      for (const s of r.porSucursal) {
        expect(q(s.netoEfectivo)).toBe(
          q(
            de(
              (m) =>
                m.turnoCaja.ubicacionId === s.ubicacion.id &&
                ['EFECTIVO', 'CONTRA_ENTREGA'].includes(m.metodoPago),
            ),
          ),
        );
      }
      const turnos = await prisma.turnoCaja.findMany({
        where: { estado: 'CERRADO', cierre: { gte: inicio, lt: fin } },
        select: { diferencia: true },
      });
      expect(q(r.consolidado.faltantes)).toBe(
        q(-suma(turnos.filter((t) => Number(t.diferencia) < 0).map((t) => t.diferencia!))),
      );
      expect(r.consolidado.turnosCerrados).toBe(turnos.length);
      // Seed: el turno de Escuintla cerró con un faltante de Q15.50.
      expect(
        r.turnos.some(
          (t) => t.ubicacion.nombre === 'Farmacia Plaza Palmeras' && q(t.diferencia) === '-15.50',
        ),
      ).toBe(true);
    });
  });

  describe('Movimiento de medicamentos (RF-34)', () => {
    it('el resumen por tipo coincide con el kardex', async () => {
      const r = (
        await http()
          .get(`${API}/reportes/movimientos?desde=2026-01-01&limit=5`)
          .set(como('auditor'))
          .expect(200)
      ).body as {
        total: number;
        data: unknown[];
        resumen: { tipo: string; movimientos: number; unidades: number }[];
      };
      const inicio = inicioDelDia(new Date('2026-01-01T00:00:00Z'));
      const fin = inicioDelDia(sumarDias(hoyGuatemala(), 1));
      const grupos = await prisma.movimientoInventario.groupBy({
        by: ['tipo'],
        where: { createdAt: { gte: inicio, lt: fin } },
        _sum: { cantidad: true },
        _count: true,
      });
      expect(r.data).toHaveLength(Math.min(5, r.total));
      expect(r.total).toBe(grupos.reduce((s, g) => s + g._count, 0));
      for (const g of grupos) {
        expect(r.resumen.find((x) => x.tipo === g.tipo)).toMatchObject({
          movimientos: g._count,
          unidades: g._sum.cantidad,
        });
      }
    });

    it('el reporte de traslados cuenta cada traslado y sus unidades', async () => {
      const r = (
        await http()
          .get(`${API}/reportes/traslados?desde=2026-01-01`)
          .set(como('auditor'))
          .expect(200)
      ).body as { totales: Record<string, number | string> };
      const inicio = inicioDelDia(new Date('2026-01-01T00:00:00Z'));
      const fin = inicioDelDia(sumarDias(hoyGuatemala(), 1));
      const traslados = await prisma.traslado.findMany({
        where: { fechaSolicitud: { gte: inicio, lt: fin } },
        select: { estado: true, detalles: { select: { cantidadEnviada: true } } },
      });
      expect(r.totales.traslados).toBe(traslados.length);
      expect(r.totales.recibidos).toBe(traslados.filter((t) => t.estado === 'RECIBIDO').length);
      expect(r.totales.cancelados).toBe(traslados.filter((t) => t.estado === 'CANCELADO').length);
      expect(r.totales.unidadesEnviadas).toBe(
        traslados.flatMap((t) => t.detalles).reduce((s, x) => s + (x.cantidadEnviada ?? 0), 0),
      );
    });
  });

  describe('Permisos', () => {
    it('cajero y operador no ven dashboards ni reportes de auditoría', async () => {
      for (const ruta of ['dashboard', 'flujo-efectivo', 'movimientos', 'traslados']) {
        await http().get(`${API}/reportes/${ruta}`).set(como('cajero.xela')).expect(403);
        await http().get(`${API}/reportes/${ruta}`).set(como('operador')).expect(403);
      }
      await http().get(`${API}/reportes/dashboard`).set(como('admin')).expect(200);
    });
  });
});
