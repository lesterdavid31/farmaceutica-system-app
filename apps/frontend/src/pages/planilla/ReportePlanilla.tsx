import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import {
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Panel,
  PanelError,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query } from '@/lib/api';
import { MESES, type ReportePlanilla as Reporte } from '@/lib/dominio';
import { formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

const corto = (n: number) => MESES[n - 1].slice(0, 3);
const miles = (v: string | number) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RF-28: gasto en planilla por mes y por ubicación, más el consolidado. */
export function ReportePlanilla() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const valido = /^\d{4}$/.test(anio);
  const consulta = useQuery({
    queryKey: ['planillas', 'reporte', anio, ubicacionId],
    queryFn: () =>
      api.get<Reporte>(
        `/planillas/reporte${query({ anio, ubicacionId: esGlobal(usuario) ? ubicacionId : undefined })}`,
      ),
    enabled: valido,
  });
  const r = consulta.data;
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Reporte de planilla"
        descripcion="Total líquido pagado por mes y por ubicación. Solo cuentan las planillas cerradas."
        acciones={
          <Button asChild>
            <Link to="/planilla/planillas">Ver planillas</Link>
          </Button>
        }
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-4 border-b border-borde p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              inputMode="numeric"
              className="w-28 tabular-nums"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
            />
          </div>
          {r && (
            <p className="m-0 pb-2 text-denso">
              Consolidado del año:{' '}
              <span className="text-seccion font-semibold tabular-nums">
                {formatearMoneda(r.total)}
              </span>
              {r.borradores > 0 && (
                <span className="ml-2 text-texto-secundario">
                  ({r.borradores}{' '}
                  {r.borradores === 1
                    ? 'planilla en borrador no incluida'
                    : 'planillas en borrador no incluidas'}
                  )
                </span>
              )}
            </p>
          )}
        </div>
        {!valido ? (
          <EstadoVacio texto="Ingrese un año de cuatro dígitos." />
        ) : consulta.isPending ? (
          <Cargando />
        ) : consulta.error ? (
          <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
        ) : r && r.ubicaciones.length === 0 ? (
          <EstadoVacio texto={`No hay planillas en ${anio}.`} />
        ) : (
          r && (
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ubicación</TableHead>
                    {meses.map((m) => (
                      <TableHead key={m} numerico>
                        {corto(m)}
                      </TableHead>
                    ))}
                    <TableHead numerico>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.ubicaciones.map((fila) => (
                    <TableRow key={fila.ubicacion.id}>
                      <TableCell className="font-semibold">{fila.ubicacion.nombre}</TableCell>
                      {meses.map((m) => {
                        const celda = fila.meses[m];
                        return (
                          <TableCell
                            key={m}
                            numerico
                            className={cn(
                              'whitespace-nowrap',
                              celda?.estado === 'BORRADOR' && 'text-ambar italic',
                            )}
                          >
                            {celda && (
                              <Link
                                to={`/planilla/planillas/${celda.id}`}
                                className="text-inherit no-underline hover:underline"
                                title={
                                  celda.estado === 'BORRADOR'
                                    ? 'Borrador: no suma al total'
                                    : undefined
                                }
                              >
                                {miles(celda.total)}
                              </Link>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell numerico className="font-semibold whitespace-nowrap">
                        {miles(fila.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-fondo font-semibold hover:bg-fondo">
                    <TableCell>Consolidado</TableCell>
                    {meses.map((m) => (
                      <TableCell key={m} numerico className="whitespace-nowrap">
                        {Number(r.consolidado[m]) ? miles(r.consolidado[m]) : '—'}
                      </TableCell>
                    ))}
                    <TableCell numerico className="whitespace-nowrap">
                      {miles(r.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="m-0 px-4 py-3 text-meta text-texto-secundario">
                Montos en quetzales. En ámbar y cursiva, planillas en borrador (no suman al total).
              </p>
            </div>
          )
        )}
      </Panel>
    </Pagina>
  );
}
