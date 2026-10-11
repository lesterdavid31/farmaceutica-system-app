import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { TipoUbicacion } from '../generated/prisma/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Convierte "true"/"false" de la query string a booleano. */
export const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CrearUbicacionDto {
  @ApiProperty({ type: String, example: 'CC-QUE', description: 'Código único en mayúsculas' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9-]{2,20}$/, {
    message: 'El código solo admite letras mayúsculas, números y guiones (2 a 20 caracteres)',
  })
  codigo!: string;

  @ApiProperty({ type: String, example: 'Farmacia Interplaza Xela' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre' })
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ type: String, enum: TipoUbicacion, enumName: 'TipoUbicacion' })
  @IsEnum(TipoUbicacion, { message: 'Seleccione un tipo de ubicación válido' })
  tipo!: TipoUbicacion;

  @ApiProperty({ type: String, example: '4a. calle 19-20, zona 3' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese la dirección' })
  @MaxLength(250)
  direccion!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione un municipio' })
  municipioId!: string;

  @ApiProperty({ type: Number, example: 14.859 })
  @Type(() => Number)
  @IsLatitude({ message: 'La latitud debe estar entre -90 y 90' })
  latitud!: number;

  @ApiProperty({ type: Number, example: -91.516 })
  @Type(() => Number)
  @IsLongitude({ message: 'La longitud debe estar entre -180 y 180' })
  longitud!: number;

  @ApiPropertyOptional({ type: String, example: '7765-4321' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class ActualizarUbicacionDto extends PartialType(CrearUbicacionDto) {}

export class FiltroUbicacionesDto extends BusquedaDto {
  @ApiPropertyOptional({ type: String, enum: TipoUbicacion, enumName: 'TipoUbicacion' })
  @IsOptional()
  @IsEnum(TipoUbicacion)
  tipo?: TipoUbicacion;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activa?: boolean;
}

export class CrearMunicipioDto {
  @ApiProperty({ type: String, example: 'San Juan Sacatepéquez' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre del municipio' })
  @MaxLength(80)
  nombre!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione un departamento' })
  departamentoId!: string;
}
