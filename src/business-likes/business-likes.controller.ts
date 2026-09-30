import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { BusinessLikesService } from './business-likes.service';

@ApiTags('Business Likes')
@Controller('businesses')
export class BusinessLikesController {
  constructor(private readonly likesService: BusinessLikesService) {}

  /**
   * Toggle لایک صفحه (نیاز به احراز هویت)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/like')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Toggle لایک کسب‌وکار (افزودن/حذف)' })
  @ApiParam({ name: 'id', type: 'string', description: 'شناسه کسب‌وکار (UUID)' })
  async toggle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
  ) {
    // پشتیبانی از هر دو ساختار JWT (sub یا id)
    const userId = req.user?.sub ?? req.user?.id;
    return this.likesService.toggle(id, userId);
  }

  /**
   * وضعیت لایک (optional auth — مهمان‌ها هم می‌توانند شمارش را ببینند)
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/likes')
  @ApiOperation({ summary: 'وضعیت لایک و شمارش (عمومی با auth اختیاری)' })
  @ApiParam({ name: 'id', type: 'string', description: 'شناسه کسب‌وکار (UUID)' })
  async getStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.likesService.getStatus(id, userId);
  }
    /**
   * لیست لایک‌کننده‌های کسب‌وکار (فقط OWNER)
   * pagination با ?page=&limit=
   */
  /**
   * لیست لایک‌کننده‌های کسب‌وکار (عمومی — social proof)
   * pagination با ?page=&limit= (max 50 در هر صفحه برای scaling)
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/likers')
  @ApiOperation({
    summary: 'لیست کاربرانی که کسب‌وکار را لایک کرده‌اند (عمومی — social proof)',
    description: 'برای نمایش در صفحه عمومی کسب‌وکار. Auth اختیاری (مهمان‌ها هم می‌توانند ببینند).',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'شناسه کسب‌وکار (UUID)' })
  async listLikers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10) || 20));
    return this.likesService.listLikers(id, pageNum, limitNum);
  }
}