import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { cn } from '@/lib/utils';

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

export interface MarcadorMapa extends Coordenadas {
  id: string;
  etiqueta: string;
  destacado?: boolean;
}

/** Centro de Guatemala para cuando todavía no hay punto. */
const GUATEMALA: [number, number] = [15.5, -90.25];

function AlHacerClic({ onClic }: { onClic: (c: Coordenadas) => void }) {
  useMapEvents({
    click: (e) =>
      onClic({
        latitud: Math.round(e.latlng.lat * 1e6) / 1e6,
        longitud: Math.round(e.latlng.lng * 1e6) / 1e6,
      }),
  });
  return null;
}

/** Centra el mapa cuando el punto cambia desde fuera (por ejemplo, al escribir coordenadas). */
function Centrar({ punto }: { punto: Coordenadas | null }) {
  const mapa = useMap();
  const latitud = punto?.latitud;
  const longitud = punto?.longitud;
  useEffect(() => {
    if (latitud !== undefined && longitud !== undefined) {
      mapa.setView([latitud, longitud], Math.max(mapa.getZoom(), 14));
    }
  }, [mapa, latitud, longitud]);
  return null;
}

/**
 * Mapa de OpenStreetMap (Leaflet, sin API key). Con `onCambio`, un clic marca el punto de
 * entrega. Los `marcadores` muestran, por ejemplo, las sucursales.
 */
export function MapaPunto({
  valor,
  onCambio,
  marcadores = [],
  className,
}: {
  valor: Coordenadas | null;
  onCambio?: (c: Coordenadas) => void;
  marcadores?: MarcadorMapa[];
  className?: string;
}) {
  return (
    <div className={cn('isolate overflow-hidden rounded-control border border-borde', className)}>
      <MapContainer
        center={valor ? [valor.latitud, valor.longitud] : GUATEMALA}
        zoom={valor ? 15 : 7}
        scrollWheelZoom={false}
        className={cn('h-full min-h-64 w-full', onCambio && 'cursor-crosshair')}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onCambio && <AlHacerClic onClic={onCambio} />}
        <Centrar punto={valor} />
        {marcadores.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.latitud, m.longitud]}
            radius={m.destacado ? 9 : 7}
            pathOptions={{
              className: m.destacado ? 'mapa-sucursal-destacada' : 'mapa-sucursal',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip>{m.etiqueta}</Tooltip>
          </CircleMarker>
        ))}
        {valor && (
          <CircleMarker
            center={[valor.latitud, valor.longitud]}
            radius={10}
            pathOptions={{ className: 'mapa-entrega', fillOpacity: 0.85, weight: 3 }}
          >
            <Tooltip>Punto de entrega</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
