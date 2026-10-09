import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { BadgeEstado, type TonoEstado } from '@/components/BadgeEstado';
import { type EstadoBaseDatos, obtenerEstadoSalud, URL_API } from '@/lib/api';
import { formatearFechaHora } from '@/lib/formato';

const baseDatosVisible: Record<EstadoBaseDatos, { texto: string; tono: TonoEstado }> = {
  ok: { texto: 'Conectada', tono: 'correcto' },
  error: { texto: 'Sin conexión', tono: 'peligro' },
  sin_configurar: { texto: 'Sin configurar', tono: 'advertencia' },
};

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-borde px-4 py-2 last:border-b-0">
      <dt className="text-denso text-texto-secundario">{etiqueta}</dt>
      <dd className="m-0 text-right text-denso">{children}</dd>
    </div>
  );
}

export function EstadoSistema() {
  const consulta = useQuery({ queryKey: ['health'], queryFn: obtenerEstadoSalud, retry: 1 });
  const { data, error, isPending, isFetching } = consulta;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="m-0 text-pagina font-semibold">Estado del sistema</h1>
          <p className="m-0 mt-1 text-denso text-texto-secundario">
            Verificación de la conexión entre el frontend, la API y la base de datos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void consulta.refetch()}
          disabled={isFetching}
          className="inline-flex h-10 items-center gap-2 rounded-control bg-verde-botica px-4 text-denso font-semibold text-white transition-colors duration-150 hover:bg-verde-botica-oscuro disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={1.75} />
          {isFetching ? 'Verificando conexión' : 'Verificar conexión'}
        </button>
      </div>

      <section
        aria-labelledby="titulo-api"
        className="max-w-2xl rounded-panel border border-borde bg-superficie"
      >
        <h2
          id="titulo-api"
          className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold"
        >
          API
        </h2>

        {isPending && (
          <p className="m-0 px-4 py-4 text-denso text-texto-secundario">Consultando la API...</p>
        )}

        {error && (
          <div className="px-4 py-4">
            <BadgeEstado tono="peligro">Sin conexión</BadgeEstado>
            <p className="m-0 mt-2 text-denso text-ladrillo">{error.message}</p>
          </div>
        )}

        {data && (
          <dl className="m-0">
            <Fila etiqueta="Estado">
              <BadgeEstado tono="correcto">En línea</BadgeEstado>
            </Fila>
            <Fila etiqueta="Base de datos">
              <BadgeEstado tono={baseDatosVisible[data.baseDatos].tono}>
                {baseDatosVisible[data.baseDatos].texto}
              </BadgeEstado>
            </Fila>
            <Fila etiqueta="Versión">
              <span className="tabular-nums">{data.version}</span>
            </Fila>
            <Fila etiqueta="Entorno">{data.entorno}</Fila>
            <Fila etiqueta="Última respuesta">
              <span className="tabular-nums">{formatearFechaHora(data.fecha)}</span>
            </Fila>
            <Fila etiqueta="Dirección">
              <span className="break-all text-texto-secundario">{URL_API}</span>
            </Fila>
          </dl>
        )}
      </section>
    </div>
  );
}
