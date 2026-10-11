/**
 * Pruebas de punta a punta del criterio de la fase 1: login funcional por rol y permisos.
 * Requieren la base de datos de apps/backend/.env con el seed aplicado (npm run seed).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Farmacia2026!';
const API = '/api/v1';

const CUENTAS = {
  admin: 'admin@farmacia.gt',
  auditor: 'auditor@farmacia.gt',
  operador: 'operador@farmacia.gt',
  gerente: 'gerente.xela@farmacia.gt',
  cajero: 'cajero.xela@farmacia.gt',
  gerenteBodega: 'gerente.bodega@farmacia.gt',
} as const;
type Cuenta = keyof typeof CUENTAS;

describe('Autenticación y permisos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<Cuenta, string>;
  const categoriasCreadas: string[] = [];

  const http = () => request(app.getHttpServer());
  const como = (cuenta: Cuenta) => ({ Authorization: `Bearer ${tokens[cuenta]}` });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const cuenta of Object.keys(CUENTAS) as Cuenta[]) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: CUENTAS[cuenta], password: PASSWORD });
      tokens[cuenta] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    // Las categorías de prueba se borran; sus registros en la bitácora quedan (son inmutables).
    if (categoriasCreadas.length > 0) {
      await prisma.categoria.deleteMany({ where: { id: { in: categoriasCreadas } } });
    }
    await app.close();
  });

  describe('Login (RF-01)', () => {
    it.each([
      ['admin', 'ADMIN', null],
      ['auditor', 'AUDITOR', null],
      ['operador', 'OPERADOR_CALL_CENTER', null],
      ['gerente', 'GERENTE', 'CC-XELA'],
      ['cajero', 'CAJERO', 'CC-XELA'],
      ['gerenteBodega', 'GERENTE', 'BOD-CENTRAL'],
    ] as const)('%s inicia sesión con su rol y ubicación', async (cuenta, rol, ubicacion) => {
      const res = await http().get(`${API}/auth/perfil`).set(como(cuenta)).expect(200);
      expect(res.body).toMatchObject({ email: CUENTAS[cuenta], rol });
      expect((res.body as { ubicacion: { codigo: string } | null }).ubicacion?.codigo ?? null).toBe(
        ubicacion,
      );
    });

    it('el token nunca incluye password_hash en el perfil', async () => {
      const res = await http().get(`${API}/auth/perfil`).set(como('admin')).expect(200);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rechaza una contraseña incorrecta con 401 y mensaje en español', async () => {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: CUENTAS.admin, password: 'incorrecta' })
        .expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        message: 'Correo o contraseña incorrectos',
        error: 'No autenticado',
      });
    });

    it('da el mismo mensaje para un correo inexistente (no revela qué correos existen)', async () => {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: 'nadie@farmacia.gt', password: PASSWORD })
        .expect(401);
      expect((res.body as { message: string }).message).toBe('Correo o contraseña incorrectos');
    });

    it('valida el cuerpo del login con el formato de error uniforme', async () => {
      const res = await http().post(`${API}/auth/login`).send({}).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Los datos enviados no son válidos',
        error: 'Solicitud inválida',
      });
      expect((res.body as { detalles: string[] }).detalles).toContain(
        'Ingrese un correo electrónico válido',
      );
    });

    it('exige token en los endpoints protegidos', async () => {
      const res = await http().get(`${API}/usuarios`).expect(401);
      expect((res.body as { message: string }).message).toBe('Inicie sesión para continuar');
    });

    it('rechaza un token alterado', async () => {
      await http()
        .get(`${API}/auth/perfil`)
        .set({ Authorization: `Bearer ${tokens.admin}x` })
        .expect(401);
    });

    it('el health check es público', async () => {
      await http().get(`${API}/health`).expect(200);
    });
  });

  describe('Permisos por rol (sección 4)', () => {
    it.each([
      // [cuenta, método, ruta, estado esperado]
      ['admin', 'get', '/usuarios', 200],
      ['auditor', 'get', '/usuarios', 200],
      ['operador', 'get', '/usuarios', 403],
      ['gerente', 'get', '/usuarios', 403],
      ['cajero', 'get', '/usuarios', 403],
      ['admin', 'get', '/bitacora', 200],
      ['auditor', 'get', '/bitacora', 200],
      ['gerente', 'get', '/bitacora', 403],
      ['cajero', 'get', '/bitacora', 403],
      ['operador', 'get', '/bitacora', 403],
      ['gerente', 'get', '/proveedores', 200],
      ['auditor', 'get', '/proveedores', 200],
      ['cajero', 'get', '/proveedores', 403],
      ['operador', 'get', '/proveedores', 403],
      ['cajero', 'get', '/productos', 200],
      ['operador', 'get', '/productos', 200],
      ['cajero', 'get', '/ubicaciones', 200],
      ['cajero', 'get', '/configuracion', 200],
    ] as const)('%s → %s %s responde %i', async (cuenta, metodo, ruta, estado) => {
      await http()[metodo](`${API}${ruta}`).set(como(cuenta)).expect(estado);
    });

    it.each(['auditor', 'gerente', 'cajero', 'operador'] as const)(
      '%s no puede crear productos ni cambiar la configuración',
      async (cuenta) => {
        const producto = await http()
          .post(`${API}/productos`)
          .set(como(cuenta))
          .send({ sku: 'X-1', nombre: 'X', principioActivo: 'X', presentacion: 'X' })
          .expect(403);
        expect(producto.body).toMatchObject({ statusCode: 403, error: 'Sin permiso' });
        await http()
          .put(`${API}/configuracion`)
          .set(como(cuenta))
          .send({ valores: { DIAS_ALERTA_VENCIMIENTO: 30 } })
          .expect(403);
      },
    );

    it('el auditor no puede escribir aunque el rol estuviera permitido', async () => {
      const res = await http()
        .post(`${API}/categorias`)
        .set(como('auditor'))
        .send({ nombre: 'No debe crearse' })
        .expect(403);
      expect((res.body as { message: string }).message).toMatch(/(solo lectura|no tiene permiso)/);
    });
  });

  describe('Reglas de usuarios', () => {
    it('no permite un cajero en la bodega central (422)', async () => {
      const bodega = await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'BOD-CENTRAL' } });
      const res = await http()
        .post(`${API}/usuarios`)
        .set(como('admin'))
        .send({
          nombre: 'Cajero de prueba',
          email: `cajero.prueba.${Date.now()}@farmacia.gt`,
          password: 'Prueba2026',
          rol: 'CAJERO',
          ubicacionId: bodega.id,
        })
        .expect(422);
      expect(res.body).toMatchObject({ statusCode: 422, error: 'Regla de negocio' });
    });

    it('no permite asignar ubicación a un rol global (422)', async () => {
      const xela = await prisma.ubicacion.findUniqueOrThrow({ where: { codigo: 'CC-XELA' } });
      await http()
        .post(`${API}/usuarios`)
        .set(como('admin'))
        .send({
          nombre: 'Operador de prueba',
          email: `operador.prueba.${Date.now()}@farmacia.gt`,
          password: 'Prueba2026',
          rol: 'OPERADOR_CALL_CENTER',
          ubicacionId: xela.id,
        })
        .expect(422);
    });

    it('rechaza un correo duplicado con 409', async () => {
      const res = await http()
        .post(`${API}/usuarios`)
        .set(como('admin'))
        .send({
          nombre: 'Duplicado',
          email: CUENTAS.auditor,
          password: 'Prueba2026',
          rol: 'AUDITOR',
        })
        .expect(409);
      expect((res.body as { error: string }).error).toBe('Conflicto');
    });

    it('el administrador no puede desactivarse a sí mismo', async () => {
      const perfil = await http().get(`${API}/auth/perfil`).set(como('admin'));
      await http()
        .delete(`${API}/usuarios/${(perfil.body as { id: string }).id}`)
        .set(como('admin'))
        .expect(422);
    });

    it('los listados de usuarios no exponen password_hash', async () => {
      const res = await http().get(`${API}/usuarios?limit=5`).set(como('admin')).expect(200);
      const cuerpo = res.body as { data: object[]; total: number; page: number; limit: number };
      expect(cuerpo).toMatchObject({ page: 1, limit: 5 });
      expect(cuerpo.total).toBeGreaterThanOrEqual(20);
      for (const usuario of cuerpo.data) {
        expect(usuario).not.toHaveProperty('passwordHash');
      }
    });
  });

  describe('Bitácora (RN-27)', () => {
    it('registra crear, actualizar (con datos antes y después) y desactivar', async () => {
      const nombre = `Categoría de prueba ${Date.now()}`;
      const creada = await http()
        .post(`${API}/categorias`)
        .set(como('admin'))
        .send({ nombre, descripcion: 'Original' })
        .expect(201);
      const id = (creada.body as { id: string }).id;
      categoriasCreadas.push(id);

      await http()
        .patch(`${API}/categorias/${id}`)
        .set(como('admin'))
        .send({ descripcion: 'Modificada' })
        .expect(200);
      await http().delete(`${API}/categorias/${id}`).set(como('admin')).expect(200);

      const registros = await prisma.bitacora.findMany({
        where: { entidad: 'Categoria', entidadId: id },
        orderBy: { createdAt: 'asc' },
        include: { usuario: true },
      });
      expect(registros.map((r) => r.accion)).toEqual(['CREAR', 'ACTUALIZAR', 'DESACTIVAR']);
      expect(registros.every((r) => r.usuario?.email === CUENTAS.admin)).toBe(true);
      expect(registros[1].datosAntes).toMatchObject({ descripcion: 'Original' });
      expect(registros[1].datosDespues).toMatchObject({ descripcion: 'Modificada' });
      expect(registros[2].datosDespues).toMatchObject({ activa: false });
      expect(registros[0].ip).toBeTruthy();
    });

    it('registra los inicios de sesión y los intentos fallidos', async () => {
      const desde = new Date();
      await http().post(`${API}/auth/login`).send({ email: CUENTAS.cajero, password: 'mala' });
      await http().post(`${API}/auth/login`).send({ email: CUENTAS.cajero, password: PASSWORD });
      const acciones = await prisma.bitacora.findMany({
        where: { entidad: 'Sesion', createdAt: { gte: desde }, usuario: { email: CUENTAS.cajero } },
        select: { accion: true },
      });
      expect(acciones.map((a) => a.accion).sort()).toEqual(['LOGIN', 'LOGIN_FALLIDO']);
    });

    it('nunca guarda contraseñas en la bitácora', async () => {
      const conPassword = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM bitacora
        WHERE datos_despues::text ILIKE '%password%' OR datos_antes::text ILIKE '%password%'`;
      expect(Number(conPassword[0].n)).toBe(0);
    });

    it('la base de datos impide editar o borrar la bitácora', async () => {
      const registro = await prisma.bitacora.findFirstOrThrow();
      await expect(
        prisma.bitacora.update({ where: { id: registro.id }, data: { accion: 'ALTERADA' } }),
      ).rejects.toThrow(/inmutable/);
      await expect(prisma.bitacora.delete({ where: { id: registro.id } })).rejects.toThrow(
        /inmutable/,
      );
    });
  });

  describe('Configuración (RF-03)', () => {
    it('valida rangos y no guarda nada si un valor es inválido', async () => {
      const antes = await http().get(`${API}/configuracion`).set(como('admin'));
      const res = await http()
        .put(`${API}/configuracion`)
        .set(como('admin'))
        .send({ valores: { TIEMPO_PREPARACION_MIN: 20, DIAS_ALERTA_VENCIMIENTO: 5000 } })
        .expect(422);
      expect((res.body as { detalles: string[] }).detalles[0]).toMatch(/entre 1 y 365/);
      const despues = await http().get(`${API}/configuracion`).set(como('admin'));
      expect(despues.body).toEqual(antes.body);
    });

    it('registra en la bitácora los valores anteriores y nuevos', async () => {
      const lista = await http().get(`${API}/configuracion`).set(como('admin'));
      const actual = (lista.body as { clave: string; valor: number }[]).find(
        (p) => p.clave === 'TIEMPO_PREPARACION_MIN',
      )!.valor;
      const desde = new Date();
      // Se guarda el mismo valor para no alterar la configuración de la demo.
      await http()
        .put(`${API}/configuracion`)
        .set(como('admin'))
        .send({ valores: { TIEMPO_PREPARACION_MIN: actual } })
        .expect(200);
      const registro = await prisma.bitacora.findFirstOrThrow({
        where: { entidad: 'Configuracion', createdAt: { gte: desde } },
      });
      expect(registro.datosAntes).toEqual({ TIEMPO_PREPARACION_MIN: actual });
      expect(registro.datosDespues).toEqual({ TIEMPO_PREPARACION_MIN: actual });
    });
  });
});
