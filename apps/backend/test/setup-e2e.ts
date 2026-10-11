// Las pruebas e2e usan la base de datos de apps/backend/.env con el seed cargado.
import { config } from 'dotenv';

config({ quiet: true });

// Las pruebas inician sesión con varios roles: se eleva el límite de intentos por minuto.
process.env.LOGIN_LIMITE_POR_MINUTO = '1000';
