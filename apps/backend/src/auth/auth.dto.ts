import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Rol, TipoUbicacion } from '../generated/prisma/enums';

export class LoginDto {
  @ApiProperty({ type: String, example: 'admin@farmacia.gt' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingrese un correo electrónico válido' })
  email!: string;

  @ApiProperty({ type: String, example: 'Farmacia2026!' })
  @IsString()
  @MinLength(1, { message: 'Ingrese su contraseña' })
  @MaxLength(100)
  password!: string;
}

export class UbicacionResumenDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  codigo!: string;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({ type: String, enum: TipoUbicacion, enumName: 'TipoUbicacion' })
  tipo!: TipoUbicacion;
}

export class PerfilDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, enum: Rol, enumName: 'Rol' })
  rol!: Rol;

  @ApiPropertyOptional({ type: UbicacionResumenDto, nullable: true })
  ubicacion!: UbicacionResumenDto | null;
}

export class RespuestaLoginDto {
  @ApiProperty({ type: String, description: 'JWT para el encabezado Authorization: Bearer' })
  accessToken!: string;

  @ApiProperty({ type: Number, description: 'Segundos de validez del token' })
  expiraEn!: number;

  @ApiProperty({ type: PerfilDto })
  usuario!: PerfilDto;
}
