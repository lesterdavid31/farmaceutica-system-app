import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decoradores';
import { Rol } from '../generated/prisma/enums';
import { FiltroBitacoraDto } from './bitacora.dto';
import { BitacoraService } from './bitacora.service';

@ApiTags('Bitácora')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR)
@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly bitacora: BitacoraService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar la bitácora por usuario, entidad, acción y fechas (RF-35)' })
  listar(@Query() filtro: FiltroBitacoraDto) {
    return this.bitacora.listar(filtro);
  }

  @Get('catalogos')
  @ApiOperation({ summary: 'Entidades y acciones registradas, para los filtros' })
  catalogos() {
    return this.bitacora.catalogos();
  }
}
