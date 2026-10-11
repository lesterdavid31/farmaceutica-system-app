/** Fecha DATE (medianoche UTC) en formato dd/mm/aaaa para los mensajes al usuario. */
export function fechaCorta(fecha: Date) {
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

/** Opciones de las transacciones interactivas: Neon puede tardar en despertar si estaba suspendida. */
export const OPCIONES_TRANSACCION = { maxWait: 10_000, timeout: 20_000 } as const;
