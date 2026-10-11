import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { aBooleano } from '../ubicaciones/ubicaciones.dto';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ─── Categorías ────────────────────────────────────────────────────────────────

export class CrearCategoriaDto {
  @ApiProperty({ type: String, example: 'Analgésicos' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre' })
  @MaxLength(80)
  nombre!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(250)
  descripcion?: string;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class ActualizarCategoriaDto extends PartialType(CrearCategoriaDto) {}

export class FiltroCategoriasDto extends BusquedaDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activa?: boolean;
}

// ─── Proveedores ───────────────────────────────────────────────────────────────

export class CrearProveedorDto {
  @ApiProperty({ type: String, example: 'Distribuidora Farmacéutica Centroamericana' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre' })
  @MaxLength(150)
  nombre!: string;

  @ApiProperty({ type: String, example: '1234567-8' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[0-9]{1,12}-?[0-9K]$/, { message: 'Ingrese un NIT válido, por ejemplo 1234567-8' })
  nit!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsEmail({}, { message: 'Ingrese un correo electrónico válido' })
  email?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(250)
  direccion?: string;

  @ApiPropertyOptional({ type: String, description: 'Persona de contacto' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  contacto?: string;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarProveedorDto extends PartialType(CrearProveedorDto) {}

export class FiltroProveedoresDto extends BusquedaDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}

// ─── Productos ─────────────────────────────────────────────────────────────────

export class CrearProductoDto {
  @ApiProperty({ type: String, example: 'MED-0001' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9-]{3,30}$/, {
    message: 'El SKU solo admite letras mayúsculas, números y guiones (3 a 30 caracteres)',
  })
  sku!: string;

  @ApiProperty({ type: String, example: 'Acetaminofén 500 mg' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el nombre' })
  @MaxLength(150)
  nombre!: string;

  @ApiProperty({ type: String, example: 'Paracetamol' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese el principio activo' })
  @MaxLength(150)
  principioActivo!: string;

  @ApiProperty({ type: String, example: 'Caja con 100 tabletas' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingrese la presentación' })
  @MaxLength(120)
  presentacion!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione una categoría' })
  categoriaId!: string;

  @ApiProperty({ type: Number, example: 25.5, description: 'Precio en quetzales' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El precio debe ser un monto con máximo 2 decimales' },
  )
  @Min(0.01, { message: 'El precio debe ser mayor que cero' })
  precioVenta!: number;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  requiereReceta?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarProductoDto extends PartialType(CrearProductoDto) {}

export class FiltroProductosDto extends BusquedaDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}
