/**
 * Criterio de la fase 5: flujo del call center de punta a punta, incluida la sugerencia de
 * traslado (RN-15 a RN-21, RF-21 a RF-25).
 *
 * Todo corre en transacciones que se revierten (kardex, caja e historial son inmutables). Los
 * productos, el cliente, el cajero y el repartidor de prueba se crean dentro de la transacción.
 * Los tiempos usan siempre el respaldo haversine para que las pruebas no dependan de Google.
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
  EstadoPedido,
  EstadoTraslado,
  EstadoVenta,
  MetodoPago,
  Puesto,
  Rol,
  TipoMovimientoInventario,
} from '../src/generated/prisma/enums';
import { hoyGuatemala, sumarDias } from '../src/inventario/fefo';
import { MotorInventarioService, Tx } from '../src/inventario/motor-inventario.service';
import { MapasService } from '../src/mapas/mapas.service';
import { PedidosService } from '../src/pedidos/pedidos.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TrasladosService } from '../src/traslados/traslados.service';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';
/** Un punto en Quetzaltenango, a pocas cuadras de Farmacia Interplaza Xela. */
const CERCA_DE_XELA = { latitud: 14.8333, longitud: -91.5167 };

class Revertir extends Error {}

describe('Call center (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let motor: MotorInventarioService;
  let pedidos: PedidosService;
  let traslados: TrasladosService;
  let caja: CajaService;
  const ubic: Record<string, string> = {};
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
        { maxWait: 15_000, timeout: 90_000 },
      )
      .catch((error: unknown) => {
        if (!(error instanceof Revertir)) {
          throw error;
        }
      });
  }

  /**
   * - Paracetamol (P1, Q10): Xela 10 en dos lotes (5 por vencer y 5 lejano) y Escuintla 10.
   * - Loratadina (P2, Q20): solo en la bodega (50).
   * - Producto sin existencia en ninguna parte (P3).
   * Además un cliente cerca de Xela, un cajero y un repartidor de Xela.
   */
  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const hoy = hoyGuatemala();
    const producto = (sku: string, nombre: string, precioVenta: number) =>
      tx.producto.create({
        data: {
          sku: `PRUEBA-${sku}-${sufijo}`,
          nombre,
          principioActivo: nombre,
          presentacion: 'Caja',
          categoriaId,
          precioVenta,
        },
      });
    const p1 = await producto('P1', 'Paracetamol (prueba)', 10);
    const p2 = await producto('P2', 'Loratadina (prueba)', 20);
    const p3 = await producto('P3', 'Producto agotado (prueba)', 5);
    const lote = (productoId: string, numeroLote: string, dias: number) =>
      tx.lote.create({
        data: {
          productoId,
          numeroLote,
          fechaVencimiento: sumarDias(hoy, dias),
          costoUnitario: 4,
        },
      });
    const p1Pronto = await lote(p1.id, 'P1-PRONTO', 20);
    const p1Lejano = await lote(p1.id, 'P1-LEJANO', 400);
    const p2Lote = await lote(p2.id, 'P2-UNICO', 300);
    const ingresar = (ubicacionId: string, loteId: string, cantidad: number) =>
      motor.ingresar(tx, {
        ubicacionId,
        loteId,
        cantidad,
        tipo: TipoMovimientoInventario.AJUSTE,
        motivo: 'Prueba',
        usuarioId: usuarios.admin.id,
      });
    await ingresar(ubic.xela, p1Lejano.id, 5);
    await ingresar(ubic.xela, p1Pronto.id, 5);
    await ingresar(ubic.escuintla, p1Lejano.id, 10);
    await ingresar(ubic.bodega, p2Lote.id, 50);

    const cliente = await tx.cliente.create({
      data: {
        nombre: 'Cliente de prueba',
        telefono: `9${String(Date.now()).slice(-7)}`,
        nit: '12345678',
        direcciones: {
          create: { direccion: 'Zona 3, Quetzaltenango', ...CERCA_DE_XELA, principal: true },
        },
      },
      include: { direcciones: true },
    });
    const u = await tx.usuario.create({
      data: {
        nombre: 'Cajero de prueba',
        email: `prueba.cajero.${sufijo}@farmacia.gt`,
        passwordHash: 'x',
        rol: Rol.CAJERO,
        ubicacionId: ubic.xela,
      },
    });
    const cajero: UsuarioAutenticado = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      ubicacionId: ubic.xela,
    };
    const repartidor = await tx.empleado.create({
      data: {
        nombres: 'Repartidor',
        apellidos: 'De Prueba',
        dpi: String(Date.now()).padStart(13, '9').slice(-13),
        puesto: Puesto.REPARTIDOR,
        salarioBase: 3500,
        ubicacionId: ubic.xela,
        fechaIngreso: hoy,
      },
    });
    const existencia = async (ubicacionId: string, loteId: string) =>
      (
        await tx.existencia.findUnique({
          where: { ubicacionId_loteId: { ubicacionId, loteId } },
        })
      )?.cantidad ?? 0;
    const crear = (items: { productoId: string; cantidad: number }[], extra = {}) =>
      pedidos.crearEn(
        tx,
        {
          clienteId: cliente.id,
          direccionId: cliente.direcciones[0].id,
          ubicacionDespachoId: ubic.xela,
          items,
          metodoPago: MetodoPago.CONTRA_ENTREGA,
          ...extra,
        },
        usuarios.operador,
      );
    const pedido = (id: string) =>
      tx.pedido.findUniqueOrThrow({
        where: { id },
        include: {
          historial: { orderBy: { createdAt: 'asc' } },
          venta: { include: { detalles: { include: { lote: true } }, pagos: true } },
          traslados: true,
          entrega: true,
        },
      });
    return {
      p1,
      p2,
      p3,
      p1Pronto,
      p1Lejano,
      p2Lote,
      cliente,
      cajero,
      repartidor,
      existencia,
      crear,
      pedido,
    };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    motor = app.get(MotorInventarioService);
    pedidos = app.get(PedidosService);
    traslados = app.get(TrasladosService);
    caja = app.get(CajaService);
    // Sin Google: los tiempos siempre salen del respaldo haversine.
    app.get(MapasService).solicitar = () => Promise.reject(new Error('Sin red en las pruebas'));

    for (const [clave, codigo] of [
      ['bodega', 'BOD-CENTRAL'],
      ['xela', 'CC-XELA'],
      ['escuintla', 'CC-ESCUINTLA'],
    ]) {
      ubic[clave] = (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo } })).id;
    }
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    const cuentas = [
      'admin',
      'auditor',
      'operador',
      'gerente.xela',
      'gerente.bodega',
      'gerente.coban',
      'cajero.xela',
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

  describe('Disponibilidad (RN-15 a RN-17)', () => {
    it('lista solo las sucursales con todo el pedido, ordenadas por tiempo, con la mejor resaltada', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const r = await pedidos.disponibilidad(
          {
            items: [{ productoId: e.p1.id, cantidad: 8 }],
            direccionId: e.cliente.direcciones[0].id,
          },
          tx,
        );
        expect(r.opciones.map((o) => o.ubicacion.id)).toEqual([ubic.xela, ubic.escuintla]);
        expect(r.mejorId).toBe(ubic.xela);
        expect(r.sugerencia).toBeNull();
        expect(r.fuente).toBe('estimado');
        const [xela, escuintla] = r.opciones;
        expect(xela.tiempoEstimadoMin).toBe(xela.rutaMin + r.preparacionMin);
        expect(xela.tiempoEstimadoMin).toBeLessThan(escuintla.tiempoEstimadoMin);
        expect(xela.formasPago).toEqual(['CONTRA_ENTREGA', 'TARJETA']);
        expect(r.total.toFixed(2)).toBe('80.00');
        // Con 11 unidades ninguna sucursal tiene todo.
        const r2 = await pedidos.disponibilidad(
          { items: [{ productoId: e.p1.id, cantidad: 11 }], ...CERCA_DE_XELA },
          tx,
        );
        expect(r2.opciones).toEqual([]);
      });
    });

    it('si ninguna tiene todo, propone la más cercana con un traslado y suma su tiempo', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const r = await pedidos.disponibilidad(
          {
            items: [
              { productoId: e.p1.id, cantidad: 3 },
              { productoId: e.p2.id, cantidad: 5 },
            ],
            ...CERCA_DE_XELA,
          },
          tx,
        );
        expect(r.opciones).toEqual([]);
        const s = r.sugerencia!;
        expect(s.ubicacion.id).toBe(ubic.xela);
        expect(s.traslados).toEqual([
          expect.objectContaining({
            origen: expect.objectContaining({ id: ubic.bodega }) as unknown,
            items: [{ productoId: e.p2.id, cantidad: 5, nombre: e.p2.nombre }],
          }),
        ]);
        expect(s.tiempoEstimadoMin).toBe(
          s.rutaMin + r.preparacionMin + s.traslados[0].tiempoMin + r.preparacionMin,
        );
        expect(s.sinCubrir).toEqual([]);
      });
    });

    it('informa lo que no hay en ninguna ubicación', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const r = await pedidos.disponibilidad(
          { items: [{ productoId: e.p3.id, cantidad: 1 }], ...CERCA_DE_XELA },
          tx,
        );
        expect(r.sugerencia?.sinCubrir).toEqual([
          { productoId: e.p3.id, cantidad: 1, nombre: e.p3.nombre },
        ]);
        await expect(e.crear([{ productoId: e.p3.id, cantidad: 1 }])).rejects.toThrow(
          'Ninguna ubicación de la cadena',
        );
      });
    });
  });

  describe('Flujo completo (RN-18 a RN-21, RF-24)', () => {
    it('crear → preparar (FEFO y venta) → asignar → en camino → entregar con cobro en caja', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const antes = Date.now();
        const id = await e.crear([{ productoId: e.p1.id, cantidad: 7 }]);
        let p = await e.pedido(id);
        expect(p.estado).toBe(EstadoPedido.PENDIENTE);
        expect(p.total.toFixed(2)).toBe('70.00');
        expect(p.fuenteEstimacion).toBe('estimado');
        expect(p.fechaCompromiso.getTime()).toBeGreaterThanOrEqual(
          antes + p.tiempoEstimadoMin * 60_000,
        );
        expect(p.traslados).toEqual([]);
        // RN-21: crear no descuenta inventario.
        expect(await e.existencia(ubic.xela, e.p1Pronto.id)).toBe(5);

        await pedidos.prepararEn(tx, id, usuarios['gerente.xela']);
        p = await e.pedido(id);
        expect(p.estado).toBe(EstadoPedido.EN_PREPARACION);
        expect(p.venta).toMatchObject({
          canal: 'CALL_CENTER',
          estado: EstadoVenta.COMPLETADA,
          nit: '12345678',
        });
        expect(p.venta!.pagos).toEqual([]);
        expect(p.venta!.detalles.map((d) => [d.lote.numeroLote, d.cantidad]).sort()).toEqual([
          ['P1-LEJANO', 2],
          ['P1-PRONTO', 5],
        ]);
        expect(await e.existencia(ubic.xela, e.p1Pronto.id)).toBe(0);
        expect(await e.existencia(ubic.xela, e.p1Lejano.id)).toBe(3);

        await pedidos.asignarEn(tx, id, { repartidorId: e.repartidor.id }, e.cajero);
        await pedidos.salirEn(tx, id, e.cajero);
        p = await e.pedido(id);
        expect(p.estado).toBe(EstadoPedido.EN_CAMINO);
        expect(p.entrega?.horaSalida).not.toBeNull();

        // Sin caja abierta no se puede registrar el cobro.
        await expect(pedidos.entregarEn(tx, id, {}, e.cajero)).rejects.toThrow('Abra su turno');
        const turnoId = await caja.abrirEn(tx, { montoInicial: 100 }, e.cajero);
        await pedidos.entregarEn(tx, id, { notas: 'Recibió la señora' }, e.cajero);
        p = await e.pedido(id);
        expect(p.estado).toBe(EstadoPedido.ENTREGADO);
        expect(p.fechaEntrega).not.toBeNull();
        expect(p.entrega?.horaEntrega).not.toBeNull();
        expect(p.venta!.pagos).toEqual([
          expect.objectContaining({ metodo: MetodoPago.CONTRA_ENTREGA }),
        ]);
        expect(p.historial.map((h) => h.estadoNuevo)).toEqual([
          EstadoPedido.PENDIENTE,
          EstadoPedido.EN_PREPARACION,
          EstadoPedido.EN_PREPARACION,
          EstadoPedido.ASIGNADO,
          EstadoPedido.EN_CAMINO,
          EstadoPedido.ENTREGADO,
        ]);

        // Contra entrega es efectivo: entra al arqueo del turno.
        const t = await tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } });
        const { efectivoEsperado } = await caja.resumen(tx, turnoId, t.montoInicial);
        expect(efectivoEsperado.toFixed(2)).toBe('170.00');
        await caja.cerrarEn(tx, turnoId, { efectivoContado: 170 }, e.cajero);
        expect(
          (await tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } })).diferencia?.toFixed(2),
        ).toBe('0.00');
      });
    });

    it('si confirma el gerente, el cobro entra al turno abierto más antiguo de la sucursal', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.crear([{ productoId: e.p1.id, cantidad: 1 }], {
          metodoPago: MetodoPago.TARJETA,
        });
        const gerente = usuarios['gerente.xela'];
        await pedidos.prepararEn(tx, id, gerente);
        await pedidos.asignarEn(tx, id, { repartidorId: e.repartidor.id }, gerente);
        await pedidos.salirEn(tx, id, gerente);
        const turnoId = await caja.abrirEn(tx, { montoInicial: 0 }, e.cajero);
        // Un turno real de Xela abierto antes que el de prueba también sería válido.
        await pedidos.entregarEn(tx, id, { referencia: 'AUT-77' }, gerente);
        const cobro = await tx.movimientoCaja.findFirstOrThrow({
          where: { referenciaId: (await e.pedido(id)).venta!.id },
        });
        expect(cobro).toMatchObject({
          tipo: 'COBRO_CONTRA_ENTREGA',
          metodoPago: MetodoPago.TARJETA,
        });
        const turnosAbiertos = await tx.turnoCaja.findMany({
          where: { ubicacionId: ubic.xela, estado: 'ABIERTO' },
          orderBy: { apertura: 'asc' },
        });
        expect(cobro.turnoCajaId).toBe(turnosAbiertos[0].id);
        if (turnosAbiertos.length === 1) {
          expect(cobro.turnoCajaId).toBe(turnoId);
        }
      });
    });
  });

  describe('Pedido con traslado (RN-17)', () => {
    it('crea el traslado del pedido, espera a recibirlo para preparar y la cancelación revierte todo', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.crear([
          { productoId: e.p1.id, cantidad: 3 },
          { productoId: e.p2.id, cantidad: 5 },
        ]);
        let p = await e.pedido(id);
        expect(p.traslados).toHaveLength(1);
        const traslado = p.traslados[0];
        expect(traslado).toMatchObject({
          origenId: ubic.bodega,
          destinoId: ubic.xela,
          motivo: 'PEDIDO_CLIENTE',
          estado: EstadoTraslado.SOLICITADO,
        });
        expect(p.historial[0].nota).toContain(`#${traslado.numero}`);

        await expect(pedidos.prepararEn(tx, id, usuarios['gerente.xela'])).rejects.toThrow(
          `espera el traslado #${traslado.numero}`,
        );

        await traslados.aprobarEn(tx, traslado.id, usuarios['gerente.bodega']);
        await traslados.despacharEn(tx, traslado.id, usuarios['gerente.bodega']);
        const filas = await tx.detalleTraslado.findMany({ where: { trasladoId: traslado.id } });
        await traslados.recibirEn(
          tx,
          traslado.id,
          {
            detalles: filas.map((f) => ({ detalleId: f.id, cantidadRecibida: f.cantidadEnviada! })),
          },
          usuarios['gerente.xela'],
        );
        expect(await e.existencia(ubic.xela, e.p2Lote.id)).toBe(5);

        await pedidos.prepararEn(tx, id, usuarios['gerente.xela']);
        expect(await e.existencia(ubic.xela, e.p2Lote.id)).toBe(0);
        expect(await e.existencia(ubic.xela, e.p1Pronto.id)).toBe(2);

        // El operador cancela: la venta se anula y el inventario vuelve a sus lotes.
        await pedidos.cancelarEn(
          tx,
          id,
          { motivo: 'El cliente ya no lo necesita' },
          usuarios.operador,
        );
        p = await e.pedido(id);
        expect(p.estado).toBe(EstadoPedido.CANCELADO);
        expect(p.motivoCancelacion).toBe('El cliente ya no lo necesita');
        expect(p.venta?.estado).toBe(EstadoVenta.ANULADA);
        expect(await e.existencia(ubic.xela, e.p2Lote.id)).toBe(5);
        expect(await e.existencia(ubic.xela, e.p1Pronto.id)).toBe(5);
        const kardex = await tx.movimientoInventario.aggregate({
          where: { referenciaTipo: 'VENTA', referenciaId: p.venta!.id },
          _sum: { cantidad: true },
        });
        expect(kardex._sum.cantidad).toBe(0);
      });
    });

    it('cancelar un pedido cancela su traslado pendiente', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.crear([{ productoId: e.p2.id, cantidad: 2 }]);
        await pedidos.cancelarEn(tx, id, { motivo: 'Pedido duplicado' }, usuarios['gerente.xela']);
        const p = await e.pedido(id);
        expect(p.traslados[0].estado).toBe(EstadoTraslado.CANCELADO);
        expect(p.venta).toBeNull();
      });
    });
  });

  describe('Reglas y permisos', () => {
    it('la fecha de compromiso no puede ser antes del tiempo estimado', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          e.crear([{ productoId: e.p1.id, cantidad: 1 }], {
            fechaCompromiso: new Date(Date.now() + 60_000).toISOString(),
          }),
        ).rejects.toThrow('fecha de compromiso');
      });
    });

    it('cada rol hace solo lo suyo y no se salta estados', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await e.crear([{ productoId: e.p1.id, cantidad: 1 }]);
        await expect(pedidos.prepararEn(tx, id, usuarios.operador)).rejects.toThrow(
          'Solo el gerente o el cajero',
        );
        await expect(pedidos.prepararEn(tx, id, usuarios['gerente.coban'])).rejects.toThrow(
          'Solo el gerente o el cajero',
        );
        await expect(pedidos.salirEn(tx, id, e.cajero)).rejects.toThrow(
          'solo sale a entrega un pedido con repartidor asignado',
        );
        await expect(
          pedidos.cancelarEn(tx, id, { motivo: 'No autorizado' }, e.cajero),
        ).rejects.toThrow('cancela pedidos');
        await pedidos.prepararEn(tx, id, e.cajero);
        await expect(pedidos.prepararEn(tx, id, e.cajero)).rejects.toThrow(
          'solo se prepara un pedido pendiente',
        );
        const otro = await tx.empleado.create({
          data: {
            nombres: 'Otro',
            apellidos: 'Puesto',
            dpi: String(Date.now() + 1)
              .padStart(13, '8')
              .slice(-13),
            puesto: Puesto.CAJERO,
            salarioBase: 3000,
            ubicacionId: ubic.xela,
            fechaIngreso: hoyGuatemala(),
          },
        });
        await expect(
          pedidos.asignarEn(tx, id, { repartidorId: otro.id }, e.cajero),
        ).rejects.toThrow('puesto de repartidor');
      });
    });
  });

  describe('Invariantes de pedidos en la base', () => {
    it('cada pedido tiene la venta y el cobro que corresponden a su estado', async () => {
      const malos = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM pedido p
        LEFT JOIN venta v ON v.pedido_id = p.id
        WHERE (p.estado = 'PENDIENTE' AND v.id IS NOT NULL)
           OR (p.estado IN ('EN_PREPARACION', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO')
               AND (v.id IS NULL OR v.estado <> 'COMPLETADA'))
           OR (p.estado = 'CANCELADO' AND v.id IS NOT NULL AND v.estado <> 'ANULADA')
           OR (p.estado = 'ENTREGADO' AND (
                 (SELECT COALESCE(SUM(monto), 0) FROM pago WHERE venta_id = v.id) <> p.total
                 OR (SELECT COALESCE(SUM(monto), 0) FROM movimiento_caja
                     WHERE referencia_id = v.id AND tipo = 'COBRO_CONTRA_ENTREGA') <> p.total))`;
      expect(Number(malos[0].n)).toBe(0);
    });

    it('el historial de cada pedido empieza en PENDIENTE y termina en su estado actual', async () => {
      const malos = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM pedido p
        WHERE (SELECT estado_nuevo FROM historial_pedido h WHERE h.pedido_id = p.id
               ORDER BY created_at ASC, id ASC LIMIT 1) <> 'PENDIENTE'
           OR (SELECT estado_nuevo FROM historial_pedido h WHERE h.pedido_id = p.id
               ORDER BY created_at DESC LIMIT 1) <> p.estado`;
      expect(Number(malos[0].n)).toBe(0);
    });
  });

  describe('API del call center: permisos y validaciones', () => {
    it('el operador consulta disponibilidad; el cajero no', async () => {
      const producto = await prisma.producto.findFirstOrThrow({ where: { sku: 'MED-0001' } });
      const cuerpo = { items: [{ productoId: producto.id, cantidad: 1 }], ...CERCA_DE_XELA };
      const res = await http()
        .post(`${API}/pedidos/disponibilidad`)
        .set(como('operador'))
        .send(cuerpo)
        .expect(200);
      expect(res.body).toHaveProperty('opciones');
      await http()
        .post(`${API}/pedidos/disponibilidad`)
        .set(como('cajero.xela'))
        .send(cuerpo)
        .expect(403);
      await http()
        .post(`${API}/pedidos/disponibilidad`)
        .set(como('operador'))
        .send({ items: [] })
        .expect(400);
    });

    it('clientes: el operador gestiona, el auditor consulta, el cajero no entra', async () => {
      await http().get(`${API}/clientes?q=5`).set(como('operador')).expect(200);
      await http().get(`${API}/clientes`).set(como('auditor')).expect(200);
      await http().get(`${API}/clientes`).set(como('cajero.xela')).expect(403);
      await http()
        .post(`${API}/clientes`)
        .set(como('auditor'))
        .send({ nombre: 'Nadie', telefono: '55550000' })
        .expect(403);
      await http()
        .post(`${API}/clientes`)
        .set(como('operador'))
        .send({ nombre: 'Nadie', telefono: '123' })
        .expect(400);
    });

    it('la bandeja de la sucursal solo muestra sus pedidos, con indicador de atraso', async () => {
      const res = await http()
        .get(`${API}/pedidos?limit=100`)
        .set(como('gerente.xela'))
        .expect(200);
      for (const p of (res.body as { data: { ubicacionDespachoId: string; atrasado: boolean }[] })
        .data) {
        expect(p.ubicacionDespachoId).toBe(ubic.xela);
        expect(typeof p.atrasado).toBe('boolean');
      }
      await http().get(`${API}/pedidos/repartidores`).set(como('gerente.xela')).expect(200);
      await http().get(`${API}/pedidos/repartidores`).set(como('operador')).expect(403);
    });

    it('responde 404 para un pedido que no existe y 403 si el cajero intenta cancelar', async () => {
      const id = randomUUID();
      await http().post(`${API}/pedidos/${id}/preparar`).set(como('gerente.xela')).expect(404);
      await http()
        .post(`${API}/pedidos/${id}/cancelar`)
        .set(como('cajero.xela'))
        .send({ motivo: 'Sin permiso' })
        .expect(403);
    });
  });
});
