/**
 * Criterio de la fase 3: ciclo de vida completo de los traslados con el kardex correcto.
 *
 * Las operaciones que mueven inventario se prueban sobre el servicio dentro de una transacción
 * que se revierte, porque el kardex es inmutable. La API se prueba con permisos y validaciones
 * que no escriben. Las invariantes revisan todos los traslados de la base (incluidos los del seed).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { UsuarioAutenticado } from '../src/common/usuario-autenticado';
import { configurarApp } from '../src/configurar-app';
import {
  EstadoTraslado,
  MotivoTraslado,
  TipoMovimientoInventario,
} from '../src/generated/prisma/enums';
import { hoyGuatemala, sumarDias } from '../src/inventario/fefo';
import { MotorInventarioService, Tx } from '../src/inventario/motor-inventario.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TrasladosService } from '../src/traslados/traslados.service';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';

class Revertir extends Error {}

describe('Traslados (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let motor: MotorInventarioService;
  let servicio: TrasladosService;
  let bodegaId: string;
  let xelaId: string;
  let zacapaId: string;
  let categoriaId: string;
  const usuarios: Record<string, UsuarioAutenticado> = {};
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const como = (cuenta: string) => ({ Authorization: `Bearer ${tokens[cuenta]}` });

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

  /** Producto de prueba en la bodega: lote vencido (50), por vencer (10) y lejano (20). */
  async function escenario(tx: Tx) {
    const hoy = hoyGuatemala();
    const producto = await tx.producto.create({
      data: {
        sku: `PRUEBA-TR-${Date.now()}`,
        nombre: 'Loratadina 10 mg (prueba)',
        principioActivo: 'Loratadina',
        presentacion: 'Caja',
        categoriaId,
        precioVenta: 30,
      },
    });
    const crearLote = (numeroLote: string, dias: number) =>
      tx.lote.create({
        data: {
          productoId: producto.id,
          numeroLote,
          fechaVencimiento: sumarDias(hoy, dias),
          costoUnitario: 12,
        },
      });
    const vencido = await crearLote('TR-VENCIDO', -2);
    const pronto = await crearLote('TR-PRONTO', 20);
    const lejano = await crearLote('TR-LEJANO', 500);
    for (const [lote, cantidad] of [
      [lejano, 20],
      [vencido, 50],
      [pronto, 10],
    ] as const) {
      await motor.ingresar(tx, {
        ubicacionId: bodegaId,
        loteId: lote.id,
        cantidad,
        tipo: TipoMovimientoInventario.AJUSTE,
        motivo: 'Prueba',
        usuarioId: usuarios.admin.id,
      });
    }
    const existencia = async (ubicacionId: string, loteId: string) =>
      (
        await tx.existencia.findUnique({
          where: { ubicacionId_loteId: { ubicacionId, loteId } },
        })
      )?.cantidad ?? 0;
    const movimientos = (trasladoId: string) =>
      tx.movimientoInventario.findMany({
        where: { referenciaTipo: 'TRASLADO', referenciaId: trasladoId },
        orderBy: { createdAt: 'asc' },
      });
    const solicitar = (cantidad: number, cuenta = 'gerente.xela') =>
      servicio.crearEn(
        tx,
        {
          origenId: bodegaId,
          destinoId: xelaId,
          motivo: MotivoTraslado.REABASTECIMIENTO,
          detalles: [{ productoId: producto.id, cantidad }],
        },
        usuarios[cuenta],
      );
    const estado = async (id: string) =>
      (await tx.traslado.findUniqueOrThrow({ where: { id } })).estado;
    const detalles = (id: string) =>
      tx.detalleTraslado.findMany({
        where: { trasladoId: id },
        include: { lote: true },
        orderBy: { lote: { fechaVencimiento: 'asc' } },
      });
    return {
      producto,
      vencido,
      pronto,
      lejano,
      existencia,
      movimientos,
      solicitar,
      estado,
      detalles,
    };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    motor = app.get(MotorInventarioService);
    servicio = app.get(TrasladosService);

    const ubicacion = async (codigo: string) =>
      (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo } })).id;
    bodegaId = await ubicacion('BOD-CENTRAL');
    xelaId = await ubicacion('CC-XELA');
    zacapaId = await ubicacion('SG-ZACAPA');
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;

    const cuentas = ['admin', 'auditor', 'gerente.bodega', 'gerente.xela', 'cajero.xela'];
    for (const cuenta of cuentas) {
      const u = await prisma.usuario.findUniqueOrThrow({
        where: { email: `${cuenta}@farmacia.gt` },
      });
      usuarios[cuenta] = {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        ubicacionId: u.ubicacionId,
      };
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: `${cuenta}@farmacia.gt`, password: PASSWORD });
      tokens[cuenta] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Ciclo de vida (RN-08 y RN-09)', () => {
    it('solicitar → aprobar → despachar por FEFO → recibir, con el kardex correcto', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.solicitar(25);
        expect(await e.estado(id)).toBe(EstadoTraslado.SOLICITADO);

        await servicio.aprobarEn(tx, id, usuarios['gerente.bodega']);
        expect(await e.estado(id)).toBe(EstadoTraslado.APROBADO);
        // Solicitar y aprobar no mueven inventario.
        expect(await e.movimientos(id)).toHaveLength(0);

        await servicio.despacharEn(tx, id, usuarios['gerente.bodega']);
        expect(await e.estado(id)).toBe(EstadoTraslado.EN_TRANSITO);
        // FEFO: primero el lote por vencer (10) y luego el lejano (15); el vencido no se toca.
        expect(await e.existencia(bodegaId, e.pronto.id)).toBe(0);
        expect(await e.existencia(bodegaId, e.lejano.id)).toBe(5);
        expect(await e.existencia(bodegaId, e.vencido.id)).toBe(50);
        expect(await e.existencia(xelaId, e.lejano.id)).toBe(0);
        const filas = await e.detalles(id);
        expect(filas.map((f) => [f.lote?.numeroLote, f.cantidadEnviada])).toEqual([
          ['TR-PRONTO', 10],
          ['TR-LEJANO', 15],
        ]);
        expect(filas.reduce((s, f) => s + f.cantidadSolicitada, 0)).toBe(25);
        const salidas = await e.movimientos(id);
        expect(salidas.map((m) => [m.tipo, m.ubicacionId, m.loteId, m.cantidad])).toEqual([
          [TipoMovimientoInventario.TRASLADO_SALIDA, bodegaId, e.pronto.id, -10],
          [TipoMovimientoInventario.TRASLADO_SALIDA, bodegaId, e.lejano.id, -15],
        ]);

        await servicio.recibirEn(
          tx,
          id,
          {
            detalles: filas.map((f) => ({ detalleId: f.id, cantidadRecibida: f.cantidadEnviada! })),
          },
          usuarios['gerente.xela'],
        );
        expect(await e.estado(id)).toBe(EstadoTraslado.RECIBIDO);
        // Se suma en el destino con el mismo lote.
        expect(await e.existencia(xelaId, e.pronto.id)).toBe(10);
        expect(await e.existencia(xelaId, e.lejano.id)).toBe(15);
        const todos = await e.movimientos(id);
        expect(todos.filter((m) => m.tipo === TipoMovimientoInventario.TRASLADO_ENTRADA)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ ubicacionId: xelaId, loteId: e.pronto.id, cantidad: 10 }),
            expect.objectContaining({ ubicacionId: xelaId, loteId: e.lejano.id, cantidad: 15 }),
          ]),
        );
        expect(todos.reduce((s, m) => s + m.cantidad, 0)).toBe(0);

        // El kardex del producto coincide con la existencia en cada ubicación y lote.
        for (const lote of [e.vencido, e.pronto, e.lejano]) {
          for (const ubicacionId of [bodegaId, xelaId]) {
            const suma = await tx.movimientoInventario.aggregate({
              where: { loteId: lote.id, ubicacionId },
              _sum: { cantidad: true },
            });
            expect(suma._sum.cantidad ?? 0).toBe(await e.existencia(ubicacionId, lote.id));
          }
        }

        const traslado = await tx.traslado.findUniqueOrThrow({ where: { id } });
        expect(traslado).toMatchObject({
          solicitadoPorId: usuarios['gerente.xela'].id,
          aprobadoPorId: usuarios['gerente.bodega'].id,
          despachadoPorId: usuarios['gerente.bodega'].id,
          recibidoPorId: usuarios['gerente.xela'].id,
        });
        expect(traslado.fechaRecepcion).not.toBeNull();
      });
    });

    it('registra el faltante de la recepción como ajuste con motivo', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.solicitar(25);
        await servicio.aprobarEn(tx, id, usuarios.admin);
        await servicio.despacharEn(tx, id, usuarios.admin);
        const [pronto, lejano] = await e.detalles(id);

        await expect(
          servicio.recibirEn(
            tx,
            id,
            {
              detalles: [
                { detalleId: pronto.id, cantidadRecibida: 10 },
                { detalleId: lejano.id, cantidadRecibida: 13 },
              ],
            },
            usuarios['gerente.xela'],
          ),
        ).rejects.toThrow('explique el motivo');
        expect(await e.estado(id)).toBe(EstadoTraslado.EN_TRANSITO);

        await servicio.recibirEn(
          tx,
          id,
          {
            detalles: [
              { detalleId: pronto.id, cantidadRecibida: 10 },
              { detalleId: lejano.id, cantidadRecibida: 13 },
            ],
            motivoDiferencia: 'Dos cajas llegaron aplastadas',
          },
          usuarios['gerente.xela'],
        );
        expect(await e.existencia(xelaId, e.lejano.id)).toBe(13);
        const ajuste = (await e.movimientos(id)).find(
          (m) => m.tipo === TipoMovimientoInventario.AJUSTE,
        );
        expect(ajuste).toMatchObject({ ubicacionId: xelaId, loteId: e.lejano.id, cantidad: -2 });
        expect(ajuste?.motivo).toContain('Dos cajas llegaron aplastadas');
        const filas = await e.detalles(id);
        expect(filas.map((f) => f.cantidadRecibida)).toEqual([10, 13]);
      });
    });

    it('no despacha si el origen no tiene existencia vigente suficiente (los vencidos no cuentan)', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        // Hay 80 unidades en la bodega, pero solo 30 vigentes.
        const id = await e.solicitar(31);
        await servicio.aprobarEn(tx, id, usuarios['gerente.bodega']);
        await expect(servicio.despacharEn(tx, id, usuarios['gerente.bodega'])).rejects.toThrow(
          'no tiene existencia vigente suficiente',
        );
        expect(await e.estado(id)).toBe(EstadoTraslado.APROBADO);
        expect(await e.movimientos(id)).toHaveLength(0);
        expect(await e.existencia(bodegaId, e.vencido.id)).toBe(50);
      });
    });

    it('rechaza transiciones fuera de orden', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.solicitar(5);
        const admin = usuarios.admin;
        await expect(servicio.despacharEn(tx, id, admin)).rejects.toThrow(
          'solo se despacha un traslado aprobado',
        );
        await expect(
          servicio.recibirEn(tx, id, { detalles: [] }, usuarios['gerente.xela']),
        ).rejects.toThrow('solo se recibe un traslado en tránsito');
        await servicio.aprobarEn(tx, id, admin);
        await expect(servicio.aprobarEn(tx, id, admin)).rejects.toThrow(
          'solo se aprueba un traslado solicitado',
        );
        await servicio.despacharEn(tx, id, admin);
        await expect(servicio.despacharEn(tx, id, admin)).rejects.toThrow(
          'solo se despacha un traslado aprobado',
        );
        await expect(
          servicio.cancelarEn(tx, id, { motivo: 'Ya no se necesita' }, admin),
        ).rejects.toThrow('solo se cancela un traslado que aún no se ha despachado');
        // Solo hubo un despacho.
        expect(await e.movimientos(id)).toHaveLength(1);
      });
    });

    it('cancelar antes de despachar no mueve inventario', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.solicitar(5);
        await servicio.aprobarEn(tx, id, usuarios['gerente.bodega']);
        await servicio.cancelarEn(
          tx,
          id,
          { motivo: 'La sucursal ya no lo necesita' },
          usuarios['gerente.xela'],
        );
        const traslado = await tx.traslado.findUniqueOrThrow({ where: { id } });
        expect(traslado).toMatchObject({
          estado: EstadoTraslado.CANCELADO,
          motivoCancelacion: 'La sucursal ya no lo necesita',
          canceladoPorId: usuarios['gerente.xela'].id,
        });
        expect(await e.movimientos(id)).toHaveLength(0);
        await expect(servicio.despacharEn(tx, id, usuarios.admin)).rejects.toThrow(
          'está cancelado',
        );
      });
    });

    it('cada gerente solo hace lo que le corresponde a su ubicación', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.solicitar(5);
        await expect(servicio.aprobarEn(tx, id, usuarios['gerente.xela'])).rejects.toThrow(
          'gerente de la ubicación de origen',
        );
        await servicio.aprobarEn(tx, id, usuarios['gerente.bodega']);
        await expect(servicio.despacharEn(tx, id, usuarios['gerente.xela'])).rejects.toThrow(
          'gerente de la ubicación de origen',
        );
        await servicio.despacharEn(tx, id, usuarios['gerente.bodega']);
        await expect(
          servicio.recibirEn(tx, id, { detalles: [] }, usuarios['gerente.bodega']),
        ).rejects.toThrow('gerente de la ubicación de destino');
      });
    });
  });

  describe('Solicitud: validaciones', () => {
    it('rechaza destino bodega, origen igual al destino, productos repetidos y pedido faltante', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const admin = usuarios.admin;
        const base = {
          origenId: xelaId,
          destinoId: zacapaId,
          motivo: MotivoTraslado.REABASTECIMIENTO,
          detalles: [{ productoId: e.producto.id, cantidad: 1 }],
        };
        await expect(servicio.crearEn(tx, { ...base, destinoId: bodegaId }, admin)).rejects.toThrow(
          'La bodega central no recibe traslados',
        );
        await expect(servicio.crearEn(tx, { ...base, destinoId: xelaId }, admin)).rejects.toThrow(
          'deben ser ubicaciones distintas',
        );
        await expect(
          servicio.crearEn(
            tx,
            {
              ...base,
              detalles: [
                { productoId: e.producto.id, cantidad: 1 },
                { productoId: e.producto.id, cantidad: 2 },
              ],
            },
            admin,
          ),
        ).rejects.toThrow('Revise los productos');
        await expect(
          servicio.crearEn(tx, { ...base, motivo: MotivoTraslado.PEDIDO_CLIENTE }, admin),
        ).rejects.toThrow('debe indicar el pedido');
        // Un gerente no solicita traslados entre otras dos ubicaciones.
        await expect(
          servicio.crearEn(tx, { ...base, origenId: bodegaId }, usuarios['gerente.xela']),
        ).rejects.toThrow('Solo puede solicitar traslados');
        // Entre sucursales sí se puede (farmacia → farmacia).
        const id = await servicio.crearEn(tx, base, usuarios['gerente.xela']);
        expect(await e.estado(id)).toBe(EstadoTraslado.SOLICITADO);
      });
    });
  });

  describe('Invariantes de los traslados en la base', () => {
    it('lo despachado salió del origen y lo recibido entró al destino con el mismo lote', async () => {
      const inconsistentes = await prisma.$queryRaw<{ n: bigint }[]>`
        WITH enviado AS (
          SELECT t.id, t.origen_id, t.destino_id, t.estado, d.lote_id, SUM(d.cantidad_enviada) AS cantidad
          FROM traslado t JOIN detalle_traslado d ON d.traslado_id = t.id
          WHERE t.estado IN ('EN_TRANSITO', 'RECIBIDO')
          GROUP BY t.id, d.lote_id
        ), kardex AS (
          SELECT referencia_id AS id, lote_id,
                 SUM(cantidad) FILTER (WHERE tipo = 'TRASLADO_SALIDA') AS salida,
                 SUM(cantidad) FILTER (WHERE tipo = 'TRASLADO_ENTRADA') AS entrada
          FROM movimiento_inventario WHERE referencia_tipo = 'TRASLADO'
          GROUP BY referencia_id, lote_id
        )
        SELECT COUNT(*) AS n FROM enviado e LEFT JOIN kardex k ON k.id = e.id AND k.lote_id = e.lote_id
        WHERE COALESCE(k.salida, 0) <> -e.cantidad
           OR COALESCE(k.entrada, 0) <> CASE WHEN e.estado = 'RECIBIDO' THEN e.cantidad ELSE 0 END`;
      expect(Number(inconsistentes[0].n)).toBe(0);
    });

    it('los traslados sin despachar no tienen movimientos ni lotes asignados', async () => {
      const conMovimientos = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM traslado t
        WHERE t.estado IN ('SOLICITADO', 'APROBADO', 'CANCELADO')
          AND (EXISTS (SELECT 1 FROM movimiento_inventario m
                       WHERE m.referencia_tipo = 'TRASLADO' AND m.referencia_id = t.id)
               OR EXISTS (SELECT 1 FROM detalle_traslado d
                          WHERE d.traslado_id = t.id AND d.lote_id IS NOT NULL))`;
      expect(Number(conMovimientos[0].n)).toBe(0);
    });

    it('las diferencias de recepción están registradas como ajuste', async () => {
      const sinAjuste = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM (
          SELECT t.id, d.lote_id, SUM(d.cantidad_enviada - d.cantidad_recibida) AS faltante
          FROM traslado t JOIN detalle_traslado d ON d.traslado_id = t.id
          WHERE t.estado = 'RECIBIDO' GROUP BY t.id, d.lote_id
        ) f
        LEFT JOIN (
          SELECT referencia_id AS id, lote_id, -SUM(cantidad) AS ajustado
          FROM movimiento_inventario
          WHERE referencia_tipo = 'TRASLADO' AND tipo = 'AJUSTE'
          GROUP BY referencia_id, lote_id
        ) a ON a.id = f.id AND a.lote_id = f.lote_id
        WHERE f.faltante <> COALESCE(a.ajustado, 0)`;
      expect(Number(sinAjuste[0].n)).toBe(0);
    });
  });

  describe('API de traslados: permisos y validaciones', () => {
    it('el cajero no tiene acceso a traslados', async () => {
      await http().get(`${API}/traslados`).set(como('cajero.xela')).expect(403);
    });

    it('el auditor lista todos, pero no puede solicitar', async () => {
      const res = await http().get(`${API}/traslados`).set(como('auditor')).expect(200);
      expect(res.body).toMatchObject({ page: 1, limit: 20 });
      await http()
        .post(`${API}/traslados`)
        .set(como('auditor'))
        .send({ origenId: bodegaId, destinoId: xelaId, detalles: [] })
        .expect(403);
    });

    it('el gerente solo ve traslados que salen de su ubicación o llegan a ella', async () => {
      const res = await http()
        .get(`${API}/traslados?limit=100`)
        .set(como('gerente.xela'))
        .expect(200);
      const data = (res.body as { data: { origen: { id: string }; destino: { id: string } }[] })
        .data;
      for (const t of data) {
        expect([t.origen.id, t.destino.id]).toContain(xelaId);
      }
    });

    it('valida la solicitud antes de escribir', async () => {
      const producto = await prisma.producto.findFirstOrThrow({ where: { activo: true } });
      const res = await http()
        .post(`${API}/traslados`)
        .set(como('gerente.xela'))
        .send({
          origenId: xelaId,
          destinoId: xelaId,
          detalles: [{ productoId: producto.id, cantidad: 3 }],
        })
        .expect(422);
      expect((res.body as { message: string }).message).toContain('ubicaciones distintas');
      await http()
        .post(`${API}/traslados`)
        .set(como('gerente.xela'))
        .send({ origenId: bodegaId, destinoId: xelaId, detalles: [] })
        .expect(400);
    });

    it('responde 404 para un traslado que no existe y 400 si falta el motivo de cancelación', async () => {
      const id = randomUUID();
      await http().get(`${API}/traslados/${id}`).set(como('admin')).expect(404);
      await http().post(`${API}/traslados/${id}/despachar`).set(como('admin')).expect(404);
      await http().post(`${API}/traslados/${id}/cancelar`).set(como('admin')).send({}).expect(400);
    });
  });
});
