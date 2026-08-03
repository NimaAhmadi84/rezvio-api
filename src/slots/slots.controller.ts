import { Controller, Get, Param, Query, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { SlotsService } from './slots.service';
import { SlotsQueryDto } from './dto/slots-query.dto';

@ApiTags('Slots')
@Controller('businesses')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get(':slug/slots')
  @ApiOperation({ summary: 'دریافت slot های آزاد یک کسب‌وکار (عمومی - برای صفحه رزرو)' })
  @ApiResponse({ status: 200, description: 'لیست slot های آزاد' })
  @ApiResponse({ status: 404, description: 'کسب‌وکار/خدمت/کارمند یافت نشد' })
  @ApiQuery({ name: 'serviceId', required: true, description: 'شناسه خدمت' })
  @ApiQuery({ name: 'staffId', required: true, description: 'شناسه کارمند' })
  @ApiQuery({ name: 'date', required: true, description: 'تاریخ (YYYY-MM-DD)' })
  async getAvailableSlots(
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: SlotsQueryDto,
  ) {
    const slots = await this.slotsService.getAvailableSlots(
      slug,
      query.serviceId,
      query.staffId,
      query.date,
    );

    return {
      date: query.date,
      slots,
      count: slots.length,
    };
  }
}
