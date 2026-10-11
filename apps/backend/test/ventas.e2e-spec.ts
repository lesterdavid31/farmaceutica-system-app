/**
 * Criterio de la fase 4: arqueo correcto y anulación que revierte todo.
 *
 * Las operaciones se prueban sobre los servicios dentro de transacciones que se revierten (el
 * kardex y la caja son inmutables). Cada prueba crea su propio cajero dentro de la transacción,
 * para no chocar con un turno real que alguien tenga abierto en la base compartida.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CajaService } from '../src/caja/caja.service';
import type { UsuarioAutenticado } from '../src/common/usuario-autenticado';
import { configurarApp } from '../src/configurar-app';
import {
  EstadoTurnoCaja,
  EstadoVenta,
  MetodoPago,
  Rol,
  TipoMovimientoInventario,
} from '../src/generated/prisma/enums';
import { hoyGuatemala, sumarDias } from '../src/inventario/fefo';
import { MotorInventarioService, Tx } from '../src/inventario/motor-inventario.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';
const { EFECTIVO, TARJETA } = MetodoPago;

class Revertir extends Error {}

describe('Caja y ventas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let motor: MotorInventarioService;
  let caja: CajaService;
  let ventas: VentasService;
  let xelaId: string;
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

  /**
   * Cajero nuevo en Xela y producto de Q25 con lotes vencido (50), por vencer (10) y lejano (20).
   */
  async function escenario(tx: Tx) {
    const hoy = hoyGuatemala();
    const sufijo = randomUUID().slice(0, 8);
    const crearCajero = async (nombre: string): Promise<UsuarioAutenticado> => {
      const u = await tx.usuario.create({
        data: {
          nombre,
          email: `prueba.${nombre}.${sufijo}@farmacia.gt`,
          passwordHash: 'x',
          rol: Rol.CAJERO,
          ubicacionId: xelaId,
        },
      });
      return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, ubicacionId: xelaId };
    };
    const cajero = await crearCajero('cajero');
    const producto = await tx.producto.create({
      data: {
        sku: `PRUEBA-VT-${sufijo}`,
        nombre: 'Omeprazol 20 mg (prueba)',
        principioActivo: 'Omeprazol',
        presentacion: 'Caja',
        categoriaId,
        precioVenta: 25,
      },
    });
    const crearLote = (numeroLote: string, dias: number) =>
      tx.lote.create({
        data: {
          productoId: producto.id,
          numeroLote,
          fechaVencimiento: sumarDias(hoy, dias),
          costoUnitario: 10,
        },
      });
    const vencido = await crearLote('VT-VENCIDO', -1);
    const pronto = await crearLote('VT-PRONTO', 15);
    const lejano = await crearLote('VT-LEJANO', 300);
    for (const [lote, cantidad] of [
      [vencido, 50],
      [pronto, 10],
      [lejano, 20],
    ] as const) {
      await motor.ingresar(tx, {
        ubicacionId: xelaId,
        loteId: lote.id,
        cantidad,
        tipo: TipoMovimientoInventario.AJUSTE,
        motivo: 'Prueba',
        usuarioId: usuarios.admin.id,
      });
    }
    // Consultas en secuencia: una transacción usa una sola conexión.
    const existencias = async () => {
      const resultado: Record<string, number> = {};
      for (const l of [vencido, pronto, lejano]) {
        resultado[l.numeroLote] = (
          await tx.existencia.findUniqueOrThrow({
            where: { ubicacionId_loteId: { ubicacionId: xelaId, loteId: l.id } },
          })
        ).cantidad;
      }
      return resultado;
    };
    const vender = (cantidad: number, pagos: { metodo: MetodoPago; monto: number }[]) =>
      ventas.crearEn(tx, { items: [{ productoId: producto.id, cantidad }], pagos }, cajero);
    const abrir = (montoInicial: number) => caja.abrirEn(tx, { montoInicial }, cajero);
    const turno = (id: string) => tx.turnoCaja.findUniqueOrThrow({ where: { id } });
    const esperado = async (id: string) => {
      const t = await turno(id);
      return (await caja.resumen(tx, id, t.montoInicial)).efectivoEsperado.toFixed(2);
    };
    return {
      cajero,
      crearCajero,
      producto,
      vencido,
      pronto,
      lejano,
      existencias,
      vender,
      abrir,
      turno,
      esperado,
    };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    motor = app.get(MotorInventarioService);
    caja = app.get(CajaService);
    ventas = app.get(VentasService);
    xelaId = (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'CC-XELA' } })).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;

    const cuentas = [
      'admin',
      'auditor',
      'gerente.xela',
      'gerente.escuintla',
      'cajero.xela',
      'cajero.escuintla',
    ];
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

  describe('Arqueo (RN-12)', () => {
    it('el esperado suma ventas en efectivo y depósitos, y resta gastos y retiros; la tarjeta no cuenta', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(500);
        await e.vender(3, [{ metodo: EFECTIVO, monto: 75 }]);
        await e.vender(12, [
          { metodo: TARJETA, monto: 200 },
          { metodo: EFECTIVO, monto: 100 },
        ]);
        const manual = (tipo: 'GASTO' | 'RETIRO' | 'DEPOSITO', monto: number) =>
          caja.registrarMovimientoEn(
            tx,
            turnoId,
            { tipo, monto, descripcion: `Prueba ${tipo}` },
            e.cajero,
          );
        await manual('GASTO', 35.25);
        await manual('RETIRO', 100);
        await manual('DEPOSITO', 50);
        // 500 + 75 + 100 + 50 − 35.25 − 100
        expect(await e.esperado(turnoId)).toBe('589.75');

        await caja.cerrarEn(tx, turnoId, { efectivoContado: 589.75 }, e.cajero);
        const cerrado = await e.turno(turnoId);
        expect(cerrado.estado).toBe(EstadoTurnoCaja.CERRADO);
        expect(cerrado.efectivoEsperado?.toFixed(2)).toBe('589.75');
        expect(cerrado.efectivoContado?.toFixed(2)).toBe('589.75');
        expect(cerrado.diferencia?.toFixed(2)).toBe('0.00');
        expect(cerrado.cierre).not.toBeNull();
      });
    });

    it('registra el faltante y el sobrante con su signo', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(300);
        await e.vender(2, [{ metodo: EFECTIVO, monto: 50 }]);
        await caja.cerrarEn(
          tx,
          turnoId,
          { efectivoContado: 340.25, observaciones: 'Faltó cambio' },
          e.cajero,
        );
        expect((await e.turno(turnoId)).diferencia?.toFixed(2)).toBe('-9.75');

        const otro = await e.crearCajero('sobrante');
        const segundo = await caja.abrirEn(tx, { montoInicial: 100 }, otro);
        await caja.cerrarEn(tx, segundo, { efectivoContado: 105 }, otro);
        expect((await e.turno(segundo)).diferencia?.toFixed(2)).toBe('5.00');
      });
    });

    it('no deja sacar más efectivo del que hay ni operar el turno de otro cajero', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(100);
        await expect(
          caja.registrarMovimientoEn(
            tx,
            turnoId,
            { tipo: 'RETIRO', monto: 100.01, descripcion: 'Retiro grande' },
            e.cajero,
          ),
        ).rejects.toThrow('no puede sacar');
        const otro = await e.crearCajero('otro');
        await expect(caja.cerrarEn(tx, turnoId, { efectivoContado: 100 }, otro)).rejects.toThrow(
          'Solo el cajero que abrió el turno',
        );
        await caja.cerrarEn(tx, turnoId, { efectivoContado: 100 }, e.cajero);
        await expect(
          caja.cerrarEn(tx, turnoId, { efectivoContado: 100 }, e.cajero),
        ).rejects.toThrow('ya está cerrado');
      });
    });
  });

  describe('Ventas (RN-11, RF-15)', () => {
    it('no se vende sin turno abierto y un cajero no abre dos turnos', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(e.vender(1, [{ metodo: EFECTIVO, monto: 25 }])).rejects.toThrow(
          'Abra un turno de caja antes de vender',
        );
        await e.abrir(0);
        await expect(e.abrir(0)).rejects.toThrow('Ya tiene un turno de caja abierto');
      });
    });

    it('descuenta por FEFO sin lotes vencidos y guarda una línea por lote al precio de venta', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await e.abrir(0);
        const ventaId = await e.vender(12, [{ metodo: EFECTIVO, monto: 300 }]);
        expect(await e.existencias()).toEqual({
          'VT-VENCIDO': 50,
          'VT-PRONTO': 0,
          'VT-LEJANO': 18,
        });
        const venta = await tx.venta.findUniqueOrThrow({
          where: { id: ventaId },
          include: { detalles: { include: { lote: true } }, pagos: true },
        });
        expect(venta.total.toFixed(2)).toBe('300.00');
        expect(venta.nit).toBe('CF');
        expect(
          venta.detalles.map((d) => [d.lote.numeroLote, d.cantidad, d.subtotal.toFixed(2)]).sort(),
        ).toEqual([
          ['VT-LEJANO', 2, '50.00'],
          ['VT-PRONTO', 10, '250.00'],
        ]);
        const kardex = await tx.movimientoInventario.aggregate({
          where: { referenciaTipo: 'VENTA', referenciaId: ventaId },
          _sum: { cantidad: true },
        });
        expect(kardex._sum.cantidad).toBe(-12);
      });
    });

    it('rechaza la venta completa si falta existencia vigente o los pagos no cuadran', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(0);
        // Hay 80 unidades, pero solo 30 vigentes.
        await expect(e.vender(31, [{ metodo: EFECTIVO, monto: 775 }])).rejects.toThrow(
          'No hay existencia suficiente',
        );
        await expect(e.vender(2, [{ metodo: EFECTIVO, monto: 40 }])).rejects.toThrow(
          'Revise los pagos',
        );
        expect(await e.existencias()).toEqual({
          'VT-VENCIDO': 50,
          'VT-PRONTO': 10,
          'VT-LEJANO': 20,
        });
        expect(await tx.movimientoCaja.count({ where: { turnoCajaId: turnoId } })).toBe(0);
        expect(await tx.venta.count({ where: { turnoCajaId: turnoId } })).toBe(0);
      });
    });
  });

  describe('Anulación (RN-14)', () => {
    it('revierte el inventario por lote y la caja por método, sin borrar nada', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(200);
        await e.vender(1, [{ metodo: EFECTIVO, monto: 25 }]);
        const antesExistencias = await e.existencias();
        const antesEsperado = await e.esperado(turnoId);

        const ventaId = await e.vender(12, [
          { metodo: TARJETA, monto: 250 },
          { metodo: EFECTIVO, monto: 50 },
        ]);
        expect(await e.esperado(turnoId)).toBe('275.00');
        await ventas.anularEn(
          tx,
          ventaId,
          { motivo: 'El cliente se arrepintió' },
          usuarios['gerente.xela'],
        );

        expect(await e.existencias()).toEqual(antesExistencias);
        expect(await e.esperado(turnoId)).toBe(antesEsperado);
        const venta = await tx.venta.findUniqueOrThrow({ where: { id: ventaId } });
        expect(venta).toMatchObject({
          estado: EstadoVenta.ANULADA,
          motivoAnulacion: 'El cliente se arrepintió',
          anuladaPorId: usuarios['gerente.xela'].id,
        });
        // Los movimientos originales siguen ahí; la anulación agrega los contrarios.
        const kardex = await tx.movimientoInventario.findMany({
          where: { referenciaTipo: 'VENTA', referenciaId: ventaId },
        });
        expect(kardex.filter((m) => m.tipo === TipoMovimientoInventario.VENTA)).toHaveLength(2);
        expect(
          kardex.filter((m) => m.tipo === TipoMovimientoInventario.ANULACION_VENTA),
        ).toHaveLength(2);
        expect(kardex.reduce((s, m) => s + m.cantidad, 0)).toBe(0);
        const cajaVenta = await tx.movimientoCaja.findMany({ where: { referenciaId: ventaId } });
        for (const metodo of [EFECTIVO, TARJETA]) {
          const neto = cajaVenta
            .filter((m) => m.metodoPago === metodo)
            .reduce((s, m) => s + m.monto.toNumber(), 0);
          expect(neto).toBe(0);
        }
        expect(cajaVenta).toHaveLength(4);
        // El arqueo posterior cuadra con lo que realmente quedó en la gaveta.
        await caja.cerrarEn(tx, turnoId, { efectivoContado: 225 }, e.cajero);
        expect((await e.turno(turnoId)).diferencia?.toFixed(2)).toBe('0.00');
      });
    });

    it('solo el gerente de la sucursal, una vez y con el turno abierto', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const turnoId = await e.abrir(0);
        const ventaId = await e.vender(1, [{ metodo: EFECTIVO, monto: 25 }]);
        const motivo = { motivo: 'Error de digitación' };
        await expect(ventas.anularEn(tx, ventaId, motivo, e.cajero)).rejects.toThrow(
          'Solo el gerente de la sucursal',
        );
        await expect(
          ventas.anularEn(tx, ventaId, motivo, usuarios['gerente.escuintla']),
        ).rejects.toThrow('Solo el gerente de la sucursal');
        await ventas.anularEn(tx, ventaId, motivo, usuarios['gerente.xela']);
        await expect(
          ventas.anularEn(tx, ventaId, motivo, usuarios['gerente.xela']),
        ).rejects.toThrow('ya está anulada');

        const otraId = await e.vender(1, [{ metodo: EFECTIVO, monto: 25 }]);
        await caja.cerrarEn(tx, turnoId, { efectivoContado: 25 }, e.cajero);
        await expect(ventas.anularEn(tx, otraId, motivo, usuarios['gerente.xela'])).rejects.toThrow(
          'ya se cerró',
        );
      });
    });
  });

  describe('Invariantes de caja y ventas en la base', () => {
    it('cada turno cerrado guarda el esperado y la diferencia que dan sus movimientos', async () => {
      const malos = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM turno_caja t
        LEFT JOIN (
          SELECT turno_caja_id, SUM(monto) AS efectivo FROM movimiento_caja
          WHERE metodo_pago = 'EFECTIVO' GROUP BY turno_caja_id
        ) m ON m.turno_caja_id = t.id
        WHERE t.estado = 'CERRADO'
          AND (t.efectivo_esperado <> t.monto_inicial + COALESCE(m.efectivo, 0)
               OR t.diferencia <> t.efectivo_contado - t.efectivo_esperado)`;
      expect(Number(malos[0].n)).toBe(0);
    });

    it('en cada venta completada los pagos y las líneas suman el total', async () => {
      const malas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM venta v
        WHERE v.estado = 'COMPLETADA' AND (
          v.total <> (SELECT COALESCE(SUM(monto), 0) FROM pago p WHERE p.venta_id = v.id)
          OR v.total <> (SELECT COALESCE(SUM(subtotal), 0) FROM detalle_venta d WHERE d.venta_id = v.id))`;
      expect(Number(malas[0].n)).toBe(0);
    });

    it('una venta anulada tiene inventario y caja netos en cero; una completada, la salida de sus líneas', async () => {
      const malas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM venta v
        WHERE v.turno_caja_id IS NOT NULL AND (
          (SELECT COALESCE(SUM(cantidad), 0) FROM movimiento_inventario m
            WHERE m.referencia_tipo = 'VENTA' AND m.referencia_id = v.id)
          <> CASE WHEN v.estado = 'ANULADA' THEN 0
                  ELSE -(SELECT SUM(cantidad) FROM detalle_venta d WHERE d.venta_id = v.id) END
          OR (SELECT COALESCE(SUM(monto), 0) FROM movimiento_caja c WHERE c.referencia_id = v.id)
          <> CASE WHEN v.estado = 'ANULADA' THEN 0 ELSE v.total END)`;
      expect(Number(malas[0].n)).toBe(0);
    });
  });

  describe('API de caja y ventas: permisos y validaciones', () => {
    it('solo el cajero abre caja y vende', async () => {
      await http()
        .post(`${API}/caja/turnos`)
        .set(como('auditor'))
        .send({ montoInicial: 0 })
        .expect(403);
      await http()
        .post(`${API}/caja/turnos`)
        .set(como('gerente.xela'))
        .send({ montoInicial: 0 })
        .expect(403);
      await http().post(`${API}/ventas`).set(como('gerente.xela')).send({}).expect(403);
      await http().post(`${API}/ventas`).set(como('admin')).send({}).expect(403);
    });

    it('el cajero no anula ventas y la anulación exige motivo', async () => {
      const id = randomUUID();
      await http()
        .post(`${API}/ventas/${id}/anular`)
        .set(como('cajero.xela'))
        .send({ motivo: 'Prueba de permisos' })
        .expect(403);
      await http()
        .post(`${API}/ventas/${id}/anular`)
        .set(como('gerente.xela'))
        .send({})
        .expect(400);
      await http()
        .post(`${API}/ventas/${id}/anular`)
        .set(como('gerente.xela'))
        .send({ motivo: 'Venta inexistente' })
        .expect(404);
    });

    it('valida montos de caja antes de escribir', async () => {
      await http()
        .post(`${API}/caja/turnos`)
        .set(como('cajero.xela'))
        .send({ montoInicial: -5 })
        .expect(400);
      await http()
        .post(`${API}/caja/turnos/${randomUUID()}/movimientos`)
        .set(como('cajero.xela'))
        .send({ tipo: 'VENTA', monto: 10, descripcion: 'No permitido' })
        .expect(400);
    });

    it('el punto de venta muestra precio y existencia vigente de la sucursal del cajero', async () => {
      const res = await http()
        .get(`${API}/ventas/productos?q=a`)
        .set(como('cajero.xela'))
        .expect(200);
      const productos = res.body as { precioVenta: unknown; vigente: unknown }[];
      expect(productos.length).toBeGreaterThan(0);
      // Los montos DECIMAL llegan como texto; la existencia, como número.
      expect(typeof productos[0].precioVenta).toBe('string');
      expect(typeof productos[0].vigente).toBe('number');
      await http().get(`${API}/ventas/productos`).set(como('admin')).expect(403);
    });

    it('cada rol ve solo los turnos y ventas que le corresponden', async () => {
      const turnos = await http().get(`${API}/caja/turnos`).set(como('cajero.xela')).expect(200);
      for (const t of (turnos.body as { data: { cajeroId: string }[] }).data) {
        expect(t.cajeroId).toBe(usuarios['cajero.xela'].id);
      }
      const lista = await http()
        .get(`${API}/ventas?limit=100`)
        .set(como('gerente.xela'))
        .expect(200);
      for (const v of (lista.body as { data: { ubicacionId: string }[] }).data) {
        expect(v.ubicacionId).toBe(xelaId);
      }
      await http().get(`${API}/ventas`).set(como('auditor')).expect(200);
      await http().get(`${API}/caja/turno-actual`).set(como('gerente.xela')).expect(403);
    });
  });
});
