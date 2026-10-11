import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DetalleCompraDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el producto' })
  productoId!: string;

  @ApiProperty({ type: String, example: 'AMX-2611-A' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9./-]{0,39}$/, {
    message: 'El número de lote admite letras, números, puntos, guiones y diagonales (máximo 40)',
  })
  numeroLote!: string;

  @ApiProperty({ type: String, format: 'date', example: '2027-11-30' })
  @IsDateString({}, { message: 'Ingrese la fecha de vencimiento' })
  fechaVencimiento!: string;

  @ApiProperty({ type: Number, example: 120 })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' })
  @Max(100000)
  cantidad!: number;

  @ApiProperty({ type: Number, example: 18.75, description: 'Costo unitario en quetzales' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El costo debe ser un monto con máximo 2 decimales' },
  )
  @Min(0.01, { message: 'El costo debe ser mayor que cero' })
  costoUnitario!: number;
}

export class CrearCompraDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el proveedor' })
  proveedorId!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'FAC-A-00123',
    description: 'Factura del proveedor',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(40)
  numeroDocumento?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Por defecto, hoy' })
  @IsOptional()
  @IsDateString({}, { message: 'Ingrese una fecha válida' })
  fecha?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @ApiProperty({ type: [DetalleCompraDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DetalleCompraDto)
  detalles!: DetalleCompraDto[];
}

export class FiltroComprasDto extends BusquedaDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
