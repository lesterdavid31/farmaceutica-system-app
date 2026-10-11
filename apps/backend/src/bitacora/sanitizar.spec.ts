import { Prisma } from '../generated/prisma/client';
import { sanitizar } from './sanitizar';

describe('sanitizar (bitácora)', () => {
  it('elimina contraseñas y tokens a cualquier profundidad', () => {
    expect(
      sanitizar({
        email: 'a@farmacia.gt',
        passwordHash: '$2b$10$...',
        password: 'secreta',
        sesion: { accessToken: 'jwt', usuario: { nombre: 'Ana', token: 'x' } },
        lista: [{ password: 'x', id: 1 }],
      }),
    ).toEqual({
      email: 'a@farmacia.gt',
      sesion: { usuario: { nombre: 'Ana' } },
      lista: [{ id: 1 }],
    });
  });

  it('serializa montos Decimal y fechas como texto', () => {
    expect(
      sanitizar({ precio: new Prisma.Decimal('25.50'), fecha: new Date('2026-10-11T12:00:00Z') }),
    ).toEqual({ precio: '25.5', fecha: '2026-10-11T12:00:00.000Z' });
  });

  it('convierte undefined y null en null', () => {
    expect(sanitizar(undefined)).toBeNull();
    expect(sanitizar(null)).toBeNull();
  });
});
