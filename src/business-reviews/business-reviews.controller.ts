import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
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
import { BusinessReviewsService } from './business-reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { VoteReviewDto } from './dto/vote-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';

@ApiTags('Business Reviews')
@Controller('businesses')
export class BusinessReviewsController {
  constructor(private readonly reviewsService: BusinessReviewsService) {}

  /**
   * ایجاد نظر (نیاز به احراز هویت)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/reviews')
  @ApiOperation({ summary: 'ثبت نظر جدید برای کسب‌وکار' })
  @ApiParam({ name: 'id', type: 'string' })
  async create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateReviewDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.reviewsService.create(id, userId, dto);
  }

  /**
   * لیست نظرات با فیلتر + مرتب‌سازی + pagination (public با optional auth)
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/reviews')
  @ApiOperation({ summary: 'لیست نظرات با فیلتر و مرتب‌سازی' })
  @ApiParam({ name: 'id', type: 'string' })
  async list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: QueryReviewsDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.reviewsService.list(id, query, userId);
  }

  /**
   * رأی مفید / مفید نبود (نیاز به احراز هویت)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/reviews/:reviewId/vote')
  @ApiOperation({ summary: 'رأی مفید/مفید نبود روی نظر' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'reviewId', type: 'string' })
  async vote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
    @Body() dto: VoteReviewDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.reviewsService.vote(id, reviewId, userId, dto.kind);
  }

  /**
   * پاسخ صاحب کسب‌وکار (نیاز به احراز هویت + ownership)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/reviews/:reviewId/reply')
  @ApiOperation({ summary: 'پاسخ صاحب کسب‌وکار به نظر' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'reviewId', type: 'string' })
  async reply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
    @Body() dto: ReplyReviewDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.reviewsService.reply(
      id,
      reviewId,
      userId,
      dto.text,
      req.user?.name || null,
    );
  }
}