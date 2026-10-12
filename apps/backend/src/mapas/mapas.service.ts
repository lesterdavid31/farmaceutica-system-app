import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { estimarRuta, Punto, TiempoRuta } from './geo';

const URL_MATRIZ = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const TIEMPO_LIMITE_MS = 5_000;

interface ElementoMatriz {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  /** Duración en formato "123s". */
  duration?: string;
  condition?: string;
  status?: { code?: number };
}

export type Origen = Punto & { id: string };

/**
 * Tiempos de ruta (sección 7.3). Usa Google Maps Routes API (Compute Route Matrix) solo desde el
 * backend, con la key en GOOGLE_MAPS_API_KEY. Si no hay key, la API falla, excede la cuota o no
 * encuentra ruta para un origen, ese origen se estima con haversine × 1.3 a la velocidad promedio
 * configurable. Cada resultado indica su fuente.
 */
@Injectable()
export class MapasService {
  private readonly logger = new Logger(MapasService.name);
  /** Reemplazable en las pruebas. */
  solicitar: typeof fetch = (...args) => fetch(...args);

  constructor(
    private readonly config: ConfigService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  get usaGoogle() {
    return Boolean(this.config.get<string>('GOOGLE_MAPS_API_KEY'));
  }

  async calcularTiempos(origenes: Origen[], destino: Punto): Promise<Map<string, TiempoRuta>> {
    const resultado = new Map<string, TiempoRuta>();
    if (origenes.length === 0) {
      return resultado;
    }
    const google = await this.consultarGoogle(origenes, destino);
    const velocidad = await this.configuracion.obtener('VELOCIDAD_PROMEDIO_KMH');
    origenes.forEach((o, i) => {
      resultado.set(o.id, google?.get(i) ?? estimarRuta(o, destino, velocidad));
    });
    return resultado;
  }

  private async consultarGoogle(
    origenes: Origen[],
    destino: Punto,
  ): Promise<Map<number, TiempoRuta> | null> {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!key) {
      return null;
    }
    const punto = (p: Punto) => ({
      waypoint: { location: { latLng: { latitude: p.latitud, longitude: p.longitud } } },
    });
    try {
      const respuesta = await this.solicitar(URL_MATRIZ, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'originIndex,destinationIndex,distanceMeters,duration,condition,status',
        },
        body: JSON.stringify({
          origins: origenes.map(punto),
          destinations: [punto(destino)],
          travelMode: 'DRIVE',
        }),
        signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      });
      if (!respuesta.ok) {
        this.logger.warn(`Routes API respondió ${respuesta.status}; se usa el respaldo`);
        return null;
      }
      const elementos = (await respuesta.json()) as ElementoMatriz[];
      const tiempos = new Map<number, TiempoRuta>();
      for (const e of Array.isArray(elementos) ? elementos : []) {
        const segundos = Number.parseFloat(e.duration ?? '');
        if (
          e.originIndex === undefined ||
          e.condition !== 'ROUTE_EXISTS' ||
          (e.status?.code ?? 0) !== 0 ||
          !Number.isFinite(segundos) ||
          e.distanceMeters === undefined
        ) {
          continue;
        }
        tiempos.set(e.originIndex, {
          distanciaKm: Math.round(e.distanceMeters / 10) / 100,
          duracionMin: Math.ceil(segundos / 60),
          fuente: 'google',
        });
      }
      return tiempos;
    } catch (error) {
      this.logger.warn(
        `Routes API no disponible (${error instanceof Error ? error.message : String(error)}); se usa el respaldo`,
      );
      return null;
    }
  }
}
