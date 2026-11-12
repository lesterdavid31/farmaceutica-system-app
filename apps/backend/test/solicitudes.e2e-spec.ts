/**
 * Separación de funciones en las cuentas: el gerente de sucursal pide la cuenta, el gerente general
 * la aprueba, el administrador de TI la crea y el gerente la vincula a su empleado.
 * Requieren la base de datos de apps/backend/.env con el seed aplicado (npm run seed).
 * Lo que crean (solicitudes, usuarios y empleados de prueba) se borra al terminar.
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
const CUENTAS = ['admin', 'gerente.general', 'gerente.xela', 'cajero.xela', 'auditor'] as const;
type Cuenta = (typeof CUENTAS)[number];

interface Solicitud {
  id: string;
  estado: string;
  acciones: string[];
  usuario: { id: string; email: string } | null;
}

describe('Solicitudes de cuenta (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<Cuenta, string>;
  const ubic: Record<string, string> = {};
  const correos: string[] = [];

  const http = () => request(app.getHttpServer());
  const como = (cuenta: Cuenta) => ({ Authorization: `Bearer ${tokens[cuenta]}` });
  const correo = (prefijo: string) => {
    const email = `${prefijo}.${Date.now()}.${correos.length}@prueba.farmacia.gt`;
    correos.push(email);
    return email;
  };
  const solicitar = (cuenta: Cuenta, datos: Record<string, unknown>) =>
    http().post(`${API}/solicitudes-usuario`).set(como(cuenta)).send(datos);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [clave, codigo] of [
      ['xela', 'CC-XELA'],
      ['peten', 'CC-PETEN'],
      ['bodega', 'BOD-CENTRAL'],
    ]) {
      ubic[clave] = (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo } })).id;
    }
    for (const cuenta of CUENTAS) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ email: `${cuenta}@farmacia.gt`, password: PASSWORD });
      tokens[cuenta] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    // Orden inverso a las llaves foráneas: empleado → solicitud → usuario.
    const usuarios = await prisma.usuario.findMany({
      where: { email: { in: correos } },
      select: { id: true },
    });
    const ids = usuarios.map((u) => u.id);
    await prisma.empleado.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.solicitudUsuario.deleteMany({ where: { email: { in: correos } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('flujo completo: el gerente pide, el gerente general aprueba, TI crea y el gerente vincula', async () => {
    const email = correo('cajero');
    const creada = await solicitar('gerente.xela', {
      nombre: 'Cajero de prueba',
      email,
      rol: 'CAJERO',
      ubicacionId: ubic.xela,
      justificacion: 'Prueba automática',
    }).expect(201);
    const solicitud = creada.body as Solicitud;
    expect(solicitud).toMatchObject({ estado: 'PENDIENTE', acciones: [] });

    // TI no aprueba y el gerente general no crea cuentas.
    await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/aprobar`)
      .set(como('admin'))
      .expect(403);
    await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/crear-cuenta`)
      .set(como('admin'))
      .send({ password: 'Prueba2026' })
      .expect(422);

    const aprobada = await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/aprobar`)
      .set(como('gerente.general'))
      .expect(200);
    expect(aprobada.body).toMatchObject({ estado: 'APROBADA', acciones: [] });
    await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/crear-cuenta`)
      .set(como('gerente.general'))
      .send({ password: 'Prueba2026' })
      .expect(403);

    const vistaTi = await http()
      .get(`${API}/solicitudes-usuario/${solicitud.id}`)
      .set(como('admin'))
      .expect(200);
    expect((vistaTi.body as Solicitud).acciones).toEqual(['crearCuenta']);

    const atendida = await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/crear-cuenta`)
      .set(como('admin'))
      .send({ password: 'Prueba2026' })
      .expect(200);
    const final = atendida.body as Solicitud;
    expect(final.estado).toBe('ATENDIDA');
    expect(final.usuario?.email).toBe(email);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(usuario).toMatchObject({ rol: 'CAJERO', ubicacionId: ubic.xela, activo: true });

    // No se puede crear dos veces.
    await http()
      .post(`${API}/solicitudes-usuario/${solicitud.id}/crear-cuenta`)
      .set(como('admin'))
      .send({ password: 'Prueba2026' })
      .expect(422);

    // El gerente ve la cuenta nueva entre los usuarios disponibles y la vincula a un empleado.
    const disponibles = await http()
      .get(`${API}/empleados/usuarios-disponibles?ubicacionId=${ubic.xela}`)
      .set(como('gerente.xela'))
      .expect(200);
    expect((disponibles.body as { id: string }[]).map((u) => u.id)).toContain(usuario.id);
    const empleado = await http()
      .post(`${API}/empleados`)
      .set(como('gerente.xela'))
      .send({
        nombres: 'Cajero',
        apellidos: 'De Prueba',
        dpi: String(Date.now()).padStart(13, '9').slice(-13),
        puesto: 'CAJERO',
        salarioBase: 4200,
        ubicacionId: ubic.xela,
        fechaIngreso: '2026-01-15',
        usuarioId: usuario.id,
      })
      .expect(201);
    expect((empleado.body as { usuario: { email: string } }).usuario.email).toBe(email);
    const despues = await http()
      .get(`${API}/empleados/usuarios-disponibles?ubicacionId=${ubic.xela}`)
      .set(como('gerente.xela'))
      .expect(200);
    expect((despues.body as { id: string }[]).map((u) => u.id)).not.toContain(usuario.id);
  });

  it('el gerente general rechaza con motivo y la solicitud ya no se puede aprobar', async () => {
    const creada = await solicitar('gerente.xela', {
      nombre: 'Gerente de prueba',
      email: correo('gerente'),
      rol: 'GERENTE',
      ubicacionId: ubic.xela,
    }).expect(201);
    const id = (creada.body as Solicitud).id;
    await http()
      .post(`${API}/solicitudes-usuario/${id}/rechazar`)
      .set(como('gerente.general'))
      .send({ motivo: 'x' })
      .expect(400);
    const rechazada = await http()
      .post(`${API}/solicitudes-usuario/${id}/rechazar`)
      .set(como('gerente.general'))
      .send({ motivo: 'La sucursal ya tiene gerente' })
      .expect(200);
    expect(rechazada.body).toMatchObject({
      estado: 'RECHAZADA',
      motivoRechazo: 'La sucursal ya tiene gerente',
    });
    await http()
      .post(`${API}/solicitudes-usuario/${id}/aprobar`)
      .set(como('gerente.general'))
      .expect(422);
  });

  it('la solicitud del gerente general nace aprobada', async () => {
    const res = await solicitar('gerente.general', {
      nombre: 'Cajero de Petén',
      email: correo('cajero.peten'),
      rol: 'CAJERO',
      ubicacionId: ubic.peten,
    }).expect(201);
    expect(res.body).toMatchObject({ estado: 'APROBADA' });
  });

  it('valida quién, para dónde y qué se puede solicitar', async () => {
    const base = { nombre: 'Prueba', rol: 'CAJERO', ubicacionId: ubic.xela };
    // Solo para su propia ubicación.
    await solicitar('gerente.xela', {
      ...base,
      email: correo('otra'),
      ubicacionId: ubic.peten,
    }).expect(403);
    // Cajero, TI y auditor no solicitan.
    await solicitar('cajero.xela', { ...base, email: correo('c') }).expect(403);
    await solicitar('admin', { ...base, email: correo('a') }).expect(403);
    await solicitar('auditor', { ...base, email: correo('au') }).expect(403);
    // Solo cuentas de gerente o cajero.
    await solicitar('gerente.general', { ...base, email: correo('r'), rol: 'AUDITOR' }).expect(400);
    // La bodega no tiene cajeros.
    await solicitar('gerente.general', {
      ...base,
      email: correo('b'),
      ubicacionId: ubic.bodega,
    }).expect(422);
    // Correo de un usuario existente o con otra solicitud en curso.
    await solicitar('gerente.xela', { ...base, email: 'cajero.xela@farmacia.gt' }).expect(409);
    const repetido = correo('repetido');
    await solicitar('gerente.xela', { ...base, email: repetido }).expect(201);
    await solicitar('gerente.xela', { ...base, email: repetido.toUpperCase() }).expect(409);
  });

  it('cada rol ve las solicitudes que le corresponden', async () => {
    const lista = async (cuenta: Cuenta) =>
      (
        (await http().get(`${API}/solicitudes-usuario?limit=100`).set(como(cuenta)).expect(200))
          .body as { data: { ubicacion: { id: string } }[] }
      ).data;
    expect((await lista('gerente.xela')).every((s) => s.ubicacion.id === ubic.xela)).toBe(true);
    expect((await lista('gerente.general')).some((s) => s.ubicacion.id !== ubic.xela)).toBe(true);
    await http()
      .get(`${API}/solicitudes-usuario?ubicacionId=${ubic.peten}`)
      .set(como('gerente.xela'))
      .expect(403);
    await http()
      .get(`${API}/empleados/usuarios-disponibles?ubicacionId=${ubic.peten}`)
      .set(como('gerente.xela'))
      .expect(403);
  });
});
