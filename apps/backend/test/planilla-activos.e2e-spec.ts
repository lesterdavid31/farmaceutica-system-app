/**
 * Criterio de la fase 6: cálculos correctos de planilla y de depreciación (RN-22 a RN-26).
 *
 * Las operaciones corren en transacciones que se revierten, con una ubicación, empleados y una
 * categoría de activos de prueba creados dentro de la transacción, para no chocar con el seed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ActivosService } from '../src/activos/activos.service';
import { AppModule } from '../src/app.module';
import type { UsuarioAutenticado } from '../src/common/usuario-autenticado';
import { configurarApp } from '../src/configurar-app';
import { ConfiguracionService } from '../src/configuracion/configuracion.service';
import { EstadoPlanilla, Puesto, TipoUbicacion } from '../src/generated/prisma/enums';
import { hoyGuatemala } from '../src/inventario/fefo';
import type { Tx } from '../src/inventario/motor-inventario.service';
import { PlanillasService } from '../src/planilla/planillas.service';
import { PrismaService } from '../src/prisma/prisma.service';

const API = '/api/v1';
const PASSWORD = 'Farmacia2026!';
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

class Revertir extends Error {}

describe('Planilla y activos fijos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let planillas: PlanillasService;
  let activos: ActivosService;
  let bonificacion: number;
  let porcentajeIgss: number;
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

  /** Ubicación de prueba con 3 empleados activos (uno ingresa en octubre) y uno inactivo. */
  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 6).toUpperCase();
    const municipioId = (await tx.municipio.findFirstOrThrow()).id;
    const nueva = (codigo: string) =>
      tx.ubicacion.create({
        data: {
          codigo: `T-${codigo}-${sufijo}`,
          nombre: `Sucursal de prueba ${codigo}`,
          tipo: TipoUbicacion.FARMACIA_CC,
          direccion: 'Prueba',
          municipioId,
          latitud: 14.6,
          longitud: -90.5,
        },
      });
    const ubicacion = await nueva('A');
    const otra = await nueva('B');
    let n = 0;
    const empleado = (salarioBase: number | string, fechaIngreso: string, activo = true) =>
      tx.empleado.create({
        data: {
          nombres: `Empleado ${++n}`,
          apellidos: 'Prueba',
          dpi: `${Date.now()}${n}`.slice(-13).padStart(13, '7'),
          puesto: Puesto.CAJERO,
          salarioBase,
          ubicacionId: ubicacion.id,
          fechaIngreso: d(fechaIngreso),
          activo,
        },
      });
    const ana = await empleado(4000, '2025-02-01');
    const beto = await empleado(3450, '2026-09-30');
    const carla = await empleado('3250.50', '2026-10-05');
    await empleado(5000, '2024-01-01', false);
    const categoria = await tx.categoriaActivo.create({
      data: { nombre: `Equipo de prueba ${sufijo}`, vidaUtilMeses: 36 },
    });
    return { ubicacion, otra, ana, beto, carla, categoria, sufijo };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    planillas = app.get(PlanillasService);
    activos = app.get(ActivosService);
    const configuracion = app.get(ConfiguracionService);
    bonificacion = await configuracion.obtener('BONIFICACION_INCENTIVO');
    porcentajeIgss = await configuracion.obtener('PORCENTAJE_IGSS_LABORAL');

    for (const cuenta of ['admin', 'auditor', 'gerente.xela', 'cajero.xela']) {
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

  describe('Planilla (RN-22, RN-23)', () => {
    it('genera con los empleados activos del mes y calcula IGSS, líquido y total', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 9 },
          usuarios.admin,
        );
        const p = await tx.planilla.findUniqueOrThrow({
          where: { id },
          include: { detalles: true },
        });
        // Carla ingresó en octubre y el cuarto empleado está inactivo: no entran.
        expect(p.detalles.map((x) => x.empleadoId).sort()).toEqual([e.ana.id, e.beto.id].sort());
        const ana = p.detalles.find((x) => x.empleadoId === e.ana.id)!;
        const igssAna = Math.round(4000 * porcentajeIgss) / 100;
        expect(ana.bonificacion.toNumber()).toBe(bonificacion);
        expect(ana.igss.toNumber()).toBe(igssAna);
        expect(ana.liquido.toNumber()).toBeCloseTo(4000 + bonificacion - igssAna, 2);
        const suma = p.detalles.reduce((s, x) => s + x.liquido.toNumber(), 0);
        expect(p.total.toNumber()).toBeCloseTo(suma, 2);
        expect(p.estado).toBe(EstadoPlanilla.BORRADOR);

        // En octubre ya entra Carla.
        const octubre = await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 10 },
          usuarios.admin,
        );
        expect(await tx.detallePlanilla.count({ where: { planillaId: octubre } })).toBe(3);
      });
    });

    it('edita bonificación y descuentos en borrador, recalcula el total y rechaza líquidos negativos', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 9 },
          usuarios.admin,
        );
        const linea = await tx.detallePlanilla.findFirstOrThrow({
          where: { planillaId: id, empleadoId: e.beto.id },
        });
        await planillas.editarLineaEn(
          tx,
          id,
          linea.id,
          { bonificacion: 300, otrosDescuentos: 125.5 },
          usuarios.admin,
        );
        const editada = await tx.detallePlanilla.findUniqueOrThrow({ where: { id: linea.id } });
        expect(editada.igss.equals(linea.igss)).toBe(true);
        expect(editada.liquido.toFixed(2)).toBe(
          (3450 + 300 - linea.igss.toNumber() - 125.5).toFixed(2),
        );
        const lineas = await tx.detallePlanilla.findMany({ where: { planillaId: id } });
        const p = await tx.planilla.findUniqueOrThrow({ where: { id } });
        expect(p.total.toFixed(2)).toBe(
          lineas.reduce((s, x) => s + x.liquido.toNumber(), 0).toFixed(2),
        );
        await expect(
          planillas.editarLineaEn(tx, id, linea.id, { otrosDescuentos: 5000 }, usuarios.admin),
        ).rejects.toThrow('superan lo devengado');
      });
    });

    it('una planilla cerrada no se modifica ni se borra (RN-23)', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 8 },
          usuarios.admin,
        );
        await planillas.cerrarEn(tx, id, usuarios.admin);
        const p = await tx.planilla.findUniqueOrThrow({
          where: { id },
          include: { detalles: true },
        });
        expect(p).toMatchObject({
          estado: EstadoPlanilla.CERRADA,
          cerradaPorId: usuarios.admin.id,
        });
        expect(p.fechaCierre).not.toBeNull();
        await expect(
          planillas.editarLineaEn(tx, id, p.detalles[0].id, { bonificacion: 0 }, usuarios.admin),
        ).rejects.toThrow('está cerrada');
        await expect(planillas.cerrarEn(tx, id, usuarios.admin)).rejects.toThrow('está cerrada');
      });
    });

    it('la base de datos también impide editar las líneas de una planilla cerrada', async () => {
      await expect(
        revertida(async (tx) => {
          const e = await escenario(tx);
          const id = await planillas.generarEn(
            tx,
            { ubicacionId: e.ubicacion.id, anio: 2026, mes: 8 },
            usuarios.admin,
          );
          await planillas.cerrarEn(tx, id, usuarios.admin);
          await tx.detallePlanilla.updateMany({
            where: { planillaId: id },
            data: { otrosDescuentos: 1, liquido: { decrement: 1 } },
          });
        }),
      ).rejects.toThrow('La planilla está cerrada');
    });

    it('no repite un mes, no genera meses futuros y respeta la ubicación del gerente', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const mes = { ubicacionId: e.ubicacion.id, anio: 2026, mes: 9 };
        await planillas.generarEn(tx, mes, usuarios.admin);
        await expect(planillas.generarEn(tx, mes, usuarios.admin)).rejects.toThrow(
          'Ya existe la planilla de septiembre de 2026',
        );
        const hoy = hoyGuatemala();
        await expect(
          planillas.generarEn(
            tx,
            { ...mes, anio: hoy.getUTCFullYear() + 1, mes: 1 },
            usuarios.admin,
          ),
        ).rejects.toThrow('mes futuro');
        await expect(
          planillas.generarEn(tx, { ...mes, mes: 7 }, usuarios['gerente.xela']),
        ).rejects.toThrow('Solo puede acceder a los datos de su ubicación');
        await expect(
          planillas.generarEn(tx, { ...mes, ubicacionId: e.otra.id }, usuarios.admin),
        ).rejects.toThrow('no tiene empleados activos');
      });
    });

    it('el reporte suma solo las planillas cerradas por mes y en el consolidado', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const agosto = await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 8 },
          usuarios.admin,
        );
        await planillas.cerrarEn(tx, agosto, usuarios.admin);
        await planillas.generarEn(
          tx,
          { ubicacionId: e.ubicacion.id, anio: 2026, mes: 9 },
          usuarios.admin,
        );
        const r = await planillas.reporte(
          { anio: 2026, ubicacionId: e.ubicacion.id },
          usuarios.admin,
          tx,
        );
        const totalAgosto = (await tx.planilla.findUniqueOrThrow({ where: { id: agosto } })).total;
        expect(r.ubicaciones).toHaveLength(1);
        expect(r.ubicaciones[0].meses[9].estado).toBe(EstadoPlanilla.BORRADOR);
        expect(r.ubicaciones[0].total.toFixed(2)).toBe(totalAgosto.toFixed(2));
        expect(r.consolidado[8].toFixed(2)).toBe(totalAgosto.toFixed(2));
        expect(r.consolidado[9].toFixed(2)).toBe('0.00');
        expect(r.total.toFixed(2)).toBe(totalAgosto.toFixed(2));
        expect(r.borradores).toBe(1);
      });
    });
  });

  describe('Activos fijos (RN-24 a RN-26)', () => {
    it('registra con la vida útil de la categoría y calcula el valor en libros a una fecha', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await activos.crearEn(
          tx,
          {
            codigo: `PR-${e.sufijo}`,
            descripcion: 'Computadora de prueba',
            categoriaId: e.categoria.id,
            ubicacionId: e.ubicacion.id,
            fechaAdquisicion: '2025-01-10',
            costo: 9000,
            valorResidual: 900,
          },
          usuarios.admin,
        );
        const a = await tx.activoFijo.findUniqueOrThrow({ where: { id } });
        expect(a.vidaUtilMeses).toBe(36);
        const r = await activos.reporte(
          { fecha: '2026-04-10', categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        expect(r.activos).toHaveLength(1);
        expect(r.activos[0]).toMatchObject({ mesesDepreciados: 15 });
        expect(r.activos[0].depreciacionMensual.toFixed(2)).toBe('225.00');
        expect(r.totales.depreciacionAcumulada.toFixed(2)).toBe('3375.00');
        expect(r.totales.valorEnLibros.toFixed(2)).toBe('5625.00');
        // Antes de adquirirlo no aparece; al final de su vida útil vale el residual.
        const antes = await activos.reporte(
          { fecha: '2024-12-31', categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        expect(antes.activos).toHaveLength(0);
        const fin = await activos.reporte(
          { fecha: '2030-01-01', categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        expect(fin.totales.valorEnLibros.toFixed(2)).toBe('900.00');
      });
    });

    it('agrupa por ubicación y por categoría y suma los totales', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const alta = (codigo: string, ubicacionId: string, costo: number) =>
          activos.crearEn(
            tx,
            {
              codigo: `${codigo}-${e.sufijo}`,
              descripcion: codigo,
              categoriaId: e.categoria.id,
              ubicacionId,
              fechaAdquisicion: '2026-01-01',
              costo,
              valorResidual: 0,
              vidaUtilMeses: 10,
            },
            usuarios.admin,
          );
        await alta('A1', e.ubicacion.id, 1000);
        await alta('A2', e.ubicacion.id, 2000);
        await alta('B1', e.otra.id, 500);
        const r = await activos.reporte(
          { fecha: '2026-06-01', categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        // 5 de 10 meses: la mitad depreciada.
        const porUbicacion = Object.fromEntries(
          r.porUbicacion.map((g) => [g.ubicacion.id, [g.cantidad, g.valorEnLibros.toFixed(2)]]),
        );
        expect(porUbicacion[e.ubicacion.id]).toEqual([2, '1500.00']);
        expect(porUbicacion[e.otra.id]).toEqual([1, '250.00']);
        expect(r.porCategoria).toHaveLength(1);
        expect(r.porCategoria[0].costo.toFixed(2)).toBe('3500.00');
        expect(r.totales.depreciacionAcumulada.toFixed(2)).toBe('1750.00');
      });
    });

    it('el traslado deja historial y el reporte usa la ubicación que tenía en la fecha', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const id = await activos.crearEn(
          tx,
          {
            codigo: `TR-${e.sufijo}`,
            descripcion: 'Refrigerador',
            categoriaId: e.categoria.id,
            ubicacionId: e.ubicacion.id,
            fechaAdquisicion: '2025-06-01',
            costo: 5000,
          },
          usuarios.admin,
        );
        await expect(
          activos.trasladarEn(
            tx,
            id,
            { ubicacionDestinoId: e.ubicacion.id, motivo: 'Mismo lugar' },
            usuarios.admin,
          ),
        ).rejects.toThrow('ya está en esa ubicación');
        await activos.trasladarEn(
          tx,
          id,
          { ubicacionDestinoId: e.otra.id, motivo: 'Apertura de la otra sucursal' },
          usuarios.admin,
        );
        const historial = await tx.historialUbicacionActivo.findMany({
          where: { activoId: id },
          orderBy: { createdAt: 'asc' },
        });
        expect(historial.map((h) => [h.ubicacionOrigenId, h.ubicacionDestinoId])).toEqual([
          [null, e.ubicacion.id],
          [e.ubicacion.id, e.otra.id],
        ]);
        const hoy = hoyGuatemala().toISOString().slice(0, 10);
        const ahora = await activos.reporte(
          { fecha: hoy, categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        expect(ahora.activos[0].ubicacion.id).toBe(e.otra.id);
        // Antes del traslado (registrado hoy) estaba en su ubicación original.
        const antes = await activos.reporte(
          { fecha: '2026-01-01', categoriaId: e.categoria.id },
          usuarios.admin,
          tx,
        );
        expect(antes.activos[0].ubicacion.id).toBe(e.ubicacion.id);

        await tx.activoFijo.update({ where: { id }, data: { activo: false } });
        await expect(
          activos.trasladarEn(
            tx,
            id,
            { ubicacionDestinoId: e.ubicacion.id, motivo: 'Regreso' },
            usuarios.admin,
          ),
        ).rejects.toThrow('dado de baja');
      });
    });

    it('valida residual, fecha y código único', async () => {
      await revertida(async (tx) => {
        const e = await escenario(tx);
        const base = {
          codigo: `VA-${e.sufijo}`,
          descripcion: 'Validación',
          categoriaId: e.categoria.id,
          ubicacionId: e.ubicacion.id,
          fechaAdquisicion: '2026-01-01',
          costo: 1000,
        };
        await expect(
          activos.crearEn(tx, { ...base, valorResidual: 1000.01 }, usuarios.admin),
        ).rejects.toThrow('residual no puede ser mayor');
        await expect(
          activos.crearEn(tx, { ...base, fechaAdquisicion: '2099-01-01' }, usuarios.admin),
        ).rejects.toThrow('no puede ser futura');
        await activos.crearEn(tx, base, usuarios.admin);
        await expect(activos.crearEn(tx, base, usuarios.admin)).rejects.toThrow(
          'Ya existe un activo con ese código',
        );
      });
    });
  });

  describe('Invariantes de la base', () => {
    it('el total de cada planilla es la suma de sus líquidos', async () => {
      const malas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM planilla p
        WHERE p.total <> (SELECT COALESCE(SUM(liquido), 0) FROM detalle_planilla d WHERE d.planilla_id = p.id)`;
      expect(Number(malas[0].n)).toBe(0);
    });

    it('la ubicación de cada activo es el destino de su último traslado', async () => {
      const malos = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM activo_fijo a
        WHERE a.ubicacion_id <> (SELECT h.ubicacion_destino_id FROM historial_ubicacion_activo h
                                 WHERE h.activo_id = a.id ORDER BY h.created_at DESC LIMIT 1)`;
      expect(Number(malos[0].n)).toBe(0);
    });
  });

  describe('API: permisos y validaciones', () => {
    it('planilla: el auditor consulta, el cajero no entra, el gerente solo su sucursal', async () => {
      await http().get(`${API}/planillas`).set(como('auditor')).expect(200);
      await http().get(`${API}/planillas/reporte?anio=2026`).set(como('auditor')).expect(200);
      await http()
        .post(`${API}/planillas`)
        .set(como('auditor'))
        .send({ ubicacionId: randomUUID(), anio: 2026, mes: 9 })
        .expect(403);
      await http().get(`${API}/empleados`).set(como('cajero.xela')).expect(403);
      const otra = await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'CC-COBAN' } });
      await http()
        .get(`${API}/empleados?ubicacionId=${otra.id}`)
        .set(como('gerente.xela'))
        .expect(403);
      await http()
        .post(`${API}/planillas`)
        .set(como('gerente.xela'))
        .send({ ubicacionId: otra.id, anio: 2026, mes: 9 })
        .expect(403);
      await http()
        .post(`${API}/empleados`)
        .set(como('admin'))
        .send({ nombres: 'X', dpi: '123' })
        .expect(400);
    });

    it('activos: solo el administrador registra; gerente y auditor consultan', async () => {
      await http().get(`${API}/activos`).set(como('gerente.xela')).expect(200);
      await http().get(`${API}/activos/reporte`).set(como('auditor')).expect(200);
      await http().get(`${API}/activos/categorias`).set(como('auditor')).expect(200);
      await http().post(`${API}/activos`).set(como('gerente.xela')).send({}).expect(403);
      await http().post(`${API}/activos`).set(como('auditor')).send({}).expect(403);
      await http()
        .post(`${API}/activos/${randomUUID()}/trasladar`)
        .set(como('admin'))
        .send({ ubicacionDestinoId: randomUUID(), motivo: 'Prueba de 404' })
        .expect(404);
    });
  });
});
