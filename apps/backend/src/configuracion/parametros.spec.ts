import { PARAMETROS, validarParametro } from './parametros';

describe('parámetros de configuración', () => {
  it('tiene los valores por defecto de la especificación', () => {
    expect(PARAMETROS.DIAS_ALERTA_VENCIMIENTO.porDefecto).toBe(90);
    expect(PARAMETROS.TIEMPO_PREPARACION_MIN.porDefecto).toBe(15);
    expect(PARAMETROS.BONIFICACION_INCENTIVO.porDefecto).toBe(250);
    expect(PARAMETROS.PORCENTAJE_IGSS_LABORAL.porDefecto).toBe(4.83);
    expect(PARAMETROS.VELOCIDAD_PROMEDIO_KMH.porDefecto).toBe(30);
  });

  it('acepta valores dentro del rango', () => {
    expect(validarParametro('DIAS_ALERTA_VENCIMIENTO', 60)).toBeNull();
    expect(validarParametro('PORCENTAJE_IGSS_LABORAL', 4.83)).toBeNull();
  });

  it('rechaza valores fuera del rango', () => {
    expect(validarParametro('DIAS_ALERTA_VENCIMIENTO', 0)).toMatch(/entre 1 y 365/);
    expect(validarParametro('VELOCIDAD_PROMEDIO_KMH', 500)).toMatch(/entre 5 y 120/);
  });

  it('exige enteros o el número de decimales del parámetro', () => {
    expect(validarParametro('TIEMPO_PREPARACION_MIN', 15.5)).toMatch(/entero/);
    expect(validarParametro('BONIFICACION_INCENTIVO', 250.123)).toMatch(/2 decimales/);
  });

  it('rechaza valores no numéricos', () => {
    expect(validarParametro('DIAS_ALERTA_VENCIMIENTO', Number.NaN)).toMatch(/ingrese un número/);
  });
});
