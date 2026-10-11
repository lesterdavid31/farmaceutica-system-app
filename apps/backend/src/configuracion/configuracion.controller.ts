import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import type { Request } from 'express';
import { SinBitacora } from '../bitacora/auditar.decorator';
import { ipDe } from '../bitacora/bitacora.interceptor';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { ConfiguracionService } from './configuracion.service';

export class ActualizarConfiguracionDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { DIAS_ALERTA_VENCIMIENTO: 60, TIEMPO_PREPARACION_MIN: 20 },
  })
  // Cada valor se valida en el servicio contra el rango de su parámetro.
  @IsObject({ message: 'Envíe los valores como un objeto { CLAVE: número }' })
  valores!: Record<string, unknown>;
}

@ApiTags('Configuración')
@ApiBearerAuth()
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  @Get()
  @ApiOperation({ summary: 'Parámetros del sistema con su valor actual' })
  listar() {
    return this.configuracion.listar();
  }

  @Put()
  @Roles(Rol.ADMIN)
  @SinBitacora() // El servicio registra los valores antes y después en la misma transacción.
  @ApiBody({ type: ActualizarConfiguracionDto })
  @ApiOperation({ summary: 'Actualizar uno o varios parámetros (RF-03)' })
  actualizar(
    @Body() dto: ActualizarConfiguracionDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() peticion: Request,
  ) {
    return this.configuracion.actualizar(dto.valores, usuario.id, ipDe(peticion));
  }
}
