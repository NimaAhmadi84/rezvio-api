import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AdminDashboardService } from './admin-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Admin — Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @RequirePermissions('report:view')
  @ApiOperation({ summary: 'آمار کامل داشبورد ادمین (KPI + نمودار + فعالیت اخیر)' })
  @ApiResponse({ status: 200, description: 'آمار داشبورد' })
  getStats(@Query() dto: DashboardQueryDto) {
    return this.dashboardService.getStats(dto.days ?? 30);
  }
}
