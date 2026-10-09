import { origenesPermitidos } from './configurar-app';

describe('origenesPermitidos', () => {
  it('en producción solo permite los dominios configurados, sin barra final', () => {
    expect(
      origenesPermitidos('https://farmacias.vercel.app/, https://otro.app', 'production'),
    ).toEqual(['https://farmacias.vercel.app', 'https://otro.app']);
  });

  it('en desarrollo agrega localhost', () => {
    expect(origenesPermitidos(undefined, 'development')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });
});
