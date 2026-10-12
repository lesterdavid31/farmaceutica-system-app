import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Teléfono guatemalteco: 8 dígitos, se aceptan espacios y guiones que se eliminan. */
const soloDigitos = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

export class CrearClienteDto {
  @ApiProperty({ type: String, example: 'María José López' })
  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'Ingrese el nombre del cliente' })
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ type: String, example: '55123456' })
  @Transform(soloDigitos)
  @Matches(/^\d{8}$/, { message: 'El teléfono debe tener 8 dígitos' })
  telefono!: string;

  @ApiPropertyOptional({ type: String, example: '4521879-3' })
  @IsOptional()
  @Transform(vacioANulo)
  @IsString()
  @MaxLength(20)
  nit?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(vacioANulo)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(120)
  email?: string;
}

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class DireccionDto {
  @ApiPropertyOptional({ type: String, example: 'Casa' })
  @IsOptional()
  @Transform(vacioANulo)
  @IsString()
  @MaxLength(40)
  alias?: string;

  @ApiProperty({ type: String, example: '4a. calle 12-30, zona 3' })
  @Transform(recortar)
  @IsString()
  @MinLength(5, { message: 'Ingrese la dirección' })
  @MaxLength(250)
  direccion!: string;

  @ApiPropertyOptional({ type: String, example: 'Portón negro frente al parque' })
  @IsOptional()
  @Transform(vacioANulo)
  @IsString()
  @MaxLength(250)
  referencia?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  municipioId?: string;

  @ApiProperty({ type: Number, example: 14.8333 })
  @Type(() => Number)
  @IsLatitude({ message: 'Latitud no válida' })
  latitud!: number;

  @ApiProperty({ type: Number, example: -91.5167 })
  @Type(() => Number)
  @IsLongitude({ message: 'Longitud no válida' })
  longitud!: number;

  @ApiPropertyOptional({ type: Boolean, description: 'Dirección que se propone por defecto' })
  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}

export class ActualizarDireccionDto extends PartialType(DireccionDto) {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class FiltroClientesDto extends BusquedaDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}
