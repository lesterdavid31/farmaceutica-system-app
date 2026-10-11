const fechaHora = new Intl.DateTimeFormat('es-GT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const fecha = new Intl.DateTimeFormat('es-GT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const moneda = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Fecha y hora en formato dd/mm/aaaa HH:mm:ss (24 h), en la zona horaria local. */
export function formatearFechaHora(valor: string | Date) {
  return fechaHora.format(typeof valor === 'string' ? new Date(valor) : valor).replace(',', '');
}

/** Fecha sin hora en formato dd/mm/aaaa. Las columnas DATE llegan como medianoche UTC. */
export function formatearFecha(valor: string | Date) {
  return fecha.format(typeof valor === 'string' ? new Date(valor) : valor);
}

/** Monto en quetzales con formato Q 1,234.56. La API envía los DECIMAL como texto. */
export function formatearMoneda(valor: string | number) {
  return `Q ${moneda.format(Number(valor))}`;
}
