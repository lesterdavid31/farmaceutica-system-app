import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual } from '../common/decoradores';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { Rol } from '../generated/prisma/enums';
import { FiltroDashboardDto, FiltroMovimientosDto, RangoFechasDto } from './reportes.dto';
import { ReportesService } from './reportes.service';

/** Auditoría y dashboards: ADMIN y AUDITOR ven todo; el GERENTE, solo su ubicación (RF-37). */
@ApiTags('Reportes')
@ApiBearerAuth()
@Roles(Rol.ADMIN, Rol.AUDITOR, Rol.GERENTE)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard ejecutivo o de sucursal (RF-32, RF-37)' })
  dashboard(@Query() filtro: FiltroDashboardDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportes.dashboard(filtro, usuario);
  }

  @Get('flujo-efectivo')
  @ApiOperation({ summary: 'Flujo de efectivo consolidado y por sucursal (RF-33)' })
  flujoEfectivo(@Query() dto: RangoFechasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportes.flujoEfectivo(dto, usuario);
  }

  @Get('movimientos')
  @ApiOperation({ summary: 'Kardex global de movimientos de medicamentos (RF-34)' })
  movimientos(@Query() filtro: FiltroMovimientosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportes.movimientos(filtro, usuario);
  }

  @Get('traslados')
  @ApiOperation({ summary: 'Traslados entre ubicaciones por ruta (RF-34)' })
  traslados(@Query() dto: RangoFechasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportes.traslados(dto, usuario);
  }
}
