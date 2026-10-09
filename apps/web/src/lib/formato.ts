const fechaHora = new Intl.DateTimeFormat('es-GT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Fecha y hora en formato dd/mm/aaaa HH:mm:ss (24 h). */
export function formatearFechaHora(valor: string | Date) {
  return fechaHora.format(typeof valor === 'string' ? new Date(valor) : valor).replace(',', '');
}
