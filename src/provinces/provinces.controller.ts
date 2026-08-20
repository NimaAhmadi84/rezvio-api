import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ProvincesService } from './provinces.service';

@ApiTags('Provinces')
@Controller('provinces')
@UseInterceptors(CacheInterceptor)
@CacheTTL(86400000) // 24 ساعت کش (داده‌های ثابت)
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @ApiOperation({ summary: 'دریافت همه استان‌ها با شهرهایشان (عمومی)' })
  @ApiResponse({ status: 200, description: 'لیست ۳۱ استان ایران' })
  getAllProvinces() {
    return this.provincesService.getAllProvinces();
  }

  @Get('names')
  @ApiOperation({ summary: 'دریافت فقط نام استان‌ها (برای dropdown)' })
  @ApiResponse({ status: 200, description: 'لیست نام ۳۱ استان' })
  getProvinceNames() {
    return this.provincesService.getProvinceNames();
  }

  @Get('cities')
  @ApiOperation({ summary: 'دریافت شهرهای یک استان خاص' })
  @ApiResponse({ status: 200, description: 'لیست شهرهای استان' })
  getCitiesByProvince(@Query('province') province: string) {
    if (!province) {
      return [];
    }
    return this.provincesService.getCitiesByProvince(province);
  }

  @Get(':id')
  @ApiOperation({ summary: 'دریافت یک استان با ID' })
  @ApiResponse({ status: 200, description: 'اطلاعات استان' })
  getProvinceById(@Param('id') id: string) {
    return this.provincesService.getProvinceById(id);
  }
}
