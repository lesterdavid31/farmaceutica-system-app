import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { Rol } from '../generated/prisma/enums';
import { aBooleano } from '../ubicaciones/ubicaciones.dto';

const MENSAJE_PASSWORD = 'La contraseña debe tener al menos 8 caracteres, con letras y números';

export class CrearUsuarioDto {
  @ApiProperty({ type: String, example: 'María López' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
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

  @ApiProperty({ type: String, minLength: 8, example: 'Farmacia2026!' })
  @IsString()
  @MinLength(8, { message: MENSAJE_PASSWORD })
  @MaxLength(100)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: MENSAJE_PASSWORD })
  password!: string;

  @ApiProperty({ type: String, enum: Rol, enumName: 'Rol' })
  @IsEnum(Rol, { message: 'Seleccione un rol válido' })
  rol!: Rol;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Obligatoria para GERENTE y CAJERO; vacía para los roles globales',
  })
  @IsOptional()
  @ValidateIf((_o, valor) => valor !== null)
  @IsUUID('all', { message: 'Seleccione una ubicación válida' })
  ubicacionId?: string | null;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarUsuarioDto extends PartialType(OmitType(CrearUsuarioDto, ['password'])) {
  @ApiPropertyOptional({
    type: String,
    minLength: 8,
    description: 'Solo si se cambia la contraseña',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: MENSAJE_PASSWORD })
  @MaxLength(100)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: MENSAJE_PASSWORD })
  password?: string;
}

export class FiltroUsuariosDto extends BusquedaDto {
  @ApiPropertyOptional({ type: String, enum: Rol, enumName: 'Rol' })
  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}
