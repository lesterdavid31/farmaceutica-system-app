import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { EstadoPedido, MetodoPago } from '../generated/prisma/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Formas de pago de los pedidos: se cobran al entregar (sección 3.3). */
export const METODOS_PEDIDO = [MetodoPago.CONTRA_ENTREGA, MetodoPago.TARJETA] as const;

export class ItemPedidoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el producto' })
  productoId!: string;

  @ApiProperty({ type: Number, example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' })
  @Max(1_000)
  cantidad!: number;
}

export class ConsultaDisponibilidadDto {
  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items!: ItemPedidoDto[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Dirección del cliente; o bien latitud y longitud',
  })
  @IsOptional()
  @IsUUID()
  direccionId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitud?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitud?: number;
}

export class CrearPedidoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el cliente' })
  clienteId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la dirección de entrega' })
  direccionId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Sucursal que despacha' })
  @IsUUID('all', { message: 'Seleccione la sucursal que despacha' })
  ubicacionDespachoId!: string;

  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items!: ItemPedidoDto[];

  @ApiProperty({ enum: METODOS_PEDIDO })
  @IsIn(METODOS_PEDIDO, { message: 'El pedido se paga contra entrega o con tarjeta' })
  metodoPago!: (typeof METODOS_PEDIDO)[number];

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Por defecto, ahora + tiempo estimado',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ingrese una fecha y hora válidas' })
  fechaCompromiso?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class AsignarRepartidorDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Empleado con puesto REPARTIDOR' })
  @IsUUID('all', { message: 'Seleccione el repartidor' })
  repartidorId!: string;
}

export class EntregarPedidoDto {
  @ApiPropertyOptional({ type: String, description: 'Autorización del datáfono (tarjeta)' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(60)
  referencia?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(250)
  notas?: string;
}

export class CancelarPedidoDto {
  @ApiProperty({ type: String, example: 'El cliente no estaba en la dirección' })
  @Transform(recortar)
  @IsString({ message: 'Explique el motivo de la cancelación' })
  @MinLength(5, { message: 'Explique el motivo de la cancelación (mínimo 5 caracteres)' })
  @MaxLength(250)
  motivo!: string;
}

export class FiltroPedidosDto extends BusquedaDto {
  @ApiPropertyOptional({ enum: EstadoPedido })
  @IsOptional()
  @IsEnum(EstadoPedido)
  estado?: EstadoPedido;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Solo pedidos atrasados (RN-18)' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  atrasados?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Solo pedidos sin entregar ni cancelar' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activos?: boolean;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class FiltroRepartidoresDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}
