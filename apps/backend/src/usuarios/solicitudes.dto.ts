import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { EstadoSolicitudUsuario, Rol } from '../generated/prisma/enums';
import { ROLES_SOLICITABLES } from './reglas-solicitud';

const MENSAJE_PASSWORD = 'La contraseña debe tener al menos 8 caracteres, con letras y números';
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearSolicitudUsuarioDto {
  @ApiProperty({ type: String, example: 'María López' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre' })
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ type: String, example: 'maria.lopez@farmacia.gt' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingrese un correo electrónico válido' })
  email!: string;

  @ApiProperty({ type: String, enum: ROLES_SOLICITABLES })
  @IsIn(ROLES_SOLICITABLES, { message: 'Solo se solicitan cuentas de gerente o cajero' })
  rol!: Rol;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiPropertyOptional({ type: String, example: 'Cajero del turno de la tarde' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(300)
  justificacion?: string;
}

export class RechazarSolicitudDto {
  @ApiProperty({ type: String, example: 'La sucursal ya tiene dos cajeros' })
  @Transform(recortar)
  @IsString()
  @MinLength(5, { message: 'Explique el motivo del rechazo (mínimo 5 caracteres)' })
  @MaxLength(300)
  motivo!: string;
}

export class CrearCuentaDto {
  @ApiProperty({ type: String, minLength: 8, example: 'Farmacia2026!' })
  @IsString()
  @MinLength(8, { message: MENSAJE_PASSWORD })
  @MaxLength(100)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: MENSAJE_PASSWORD })
  password!: string;
}

export class FiltroSolicitudesDto extends BusquedaDto {
  @ApiPropertyOptional({ enum: EstadoSolicitudUsuario })
  @IsOptional()
  @IsEnum(EstadoSolicitudUsuario)
  estado?: EstadoSolicitudUsuario;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}
