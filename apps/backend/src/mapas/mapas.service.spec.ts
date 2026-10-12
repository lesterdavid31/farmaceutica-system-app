import { ConfigService } from '@nestjs/config';
import type { ConfiguracionService } from '../configuracion/configuracion.service';
import { estimarRuta, haversineKm, masCercanos } from './geo';
import { MapasService } from './mapas.service';

const XELA = { latitud: 14.84, longitud: -91.5265 };
const GUATEMALA = { latitud: 14.5935, longitud: -90.531 };
const cliente = { latitud: 14.8333, longitud: -91.5167 };

describe('geo', () => {
  it('haversine entre Quetzaltenango y Ciudad de Guatemala ronda los 110 km', () => {
    const km = haversineKm(XELA, GUATEMALA);
    expect(km).toBeGreaterThan(105);
    expect(km).toBeLessThan(115);
    expect(haversineKm(XELA, XELA)).toBe(0);
  });

  it('el respaldo multiplica por 1.3 y usa la velocidad promedio', () => {
    const r = estimarRuta(XELA, GUATEMALA, 30);
    expect(r.fuente).toBe('estimado');
    expect(r.distanciaKm).toBeCloseTo(haversineKm(XELA, GUATEMALA) * 1.3, 1);
    expect(r.duracionMin).toBe(Math.ceil((r.distanciaKm / 30) * 60));
    // A 60 km/h, la mitad del tiempo (± el redondeo al minuto).
    expect(
      Math.abs(estimarRuta(XELA, GUATEMALA, 60).duracionMin - r.duracionMin / 2),
    ).toBeLessThanOrEqual(1);
  });

  it('masCercanos ordena por distancia y limita la cantidad', () => {
    const puntos = [
      { id: 'gt', ...GUATEMALA },
      { id: 'xela', ...XELA },
    ];
    expect(masCercanos(puntos, cliente, 1).map((p) => p.id)).toEqual(['xela']);
  });
});

describe('MapasService', () => {
  const configuracion = {
    obtener: jest.fn().mockResolvedValue(30),
  } as unknown as ConfiguracionService;
  const origenes = [
    { id: 'xela', ...XELA },
    { id: 'gt', ...GUATEMALA },
  ];
  const servicio = (key?: string) =>
    new MapasService(new ConfigService({ GOOGLE_MAPS_API_KEY: key }), configuracion);

  it('sin API key usa el respaldo para todos los orígenes', async () => {
    const s = servicio();
    s.solicitar = jest.fn();
    const r = await s.calcularTiempos(origenes, cliente);
    expect(s.solicitar).not.toHaveBeenCalled();
    expect([...r.values()].every((t) => t.fuente === 'estimado')).toBe(true);
  });

  it('con API key usa Google y completa con el respaldo los orígenes sin ruta', async () => {
    const s = servicio('clave');
    s.solicitar = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            distanceMeters: 2450,
            duration: '420s',
            condition: 'ROUTE_EXISTS',
          },
          { originIndex: 1, destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' },
        ]),
        { status: 200 },
      ),
    );
    const r = await s.calcularTiempos(origenes, cliente);
    expect(r.get('xela')).toEqual({ distanciaKm: 2.45, duracionMin: 7, fuente: 'google' });
    expect(r.get('gt')?.fuente).toBe('estimado');
    const [, opciones] = (s.solicitar as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((opciones.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('clave');
  });

  it('si la API falla o excede la cuota, usa el respaldo', async () => {
    const s = servicio('clave');
    s.solicitar = jest.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    const r = await s.calcularTiempos(origenes, cliente);
    expect(r.get('xela')?.fuente).toBe('estimado');

    s.solicitar = jest.fn().mockRejectedValue(new Error('timeout'));
    const r2 = await s.calcularTiempos(origenes, cliente);
    expect(r2.get('gt')?.fuente).toBe('estimado');
  });
});
