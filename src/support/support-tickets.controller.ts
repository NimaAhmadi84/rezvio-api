import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { SupportTicketsService } from './support-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';

/**
 * SupportTicketsController — endpoints کاربر (customer-facing)
 *
 * @UseGuards فقط JwtAuthGuard — هر کاربر احراز هویت‌شده می‌تواند:
 *   - تیکت بسازد
 *   - لیست تیکت‌های خودش را ببیند
 *   - به تیکت خودش پاسخ دهد
 *   - تیکت خودش را ببندد
 *
 * ⚠️ Ownership در service چک می‌شود (نه در controller)
 *   → findFirst({ where: { id, userId } }) — همیشه scope به user
 */
@ApiTags('Support — Tickets (Customer)')
@Controller('support/tickets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportTicketsController {
  constructor(
    private readonly supportTicketsService: SupportTicketsService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // ضد spam: حداکثر ۵ تیکت در دقیقه
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ایجاد تیکت جدید (همراه با پیام اولیه)' })
  @ApiResponse({ status: 201, description: 'تیکت ایجاد شد' })
  @ApiResponse({ status: 400, description: 'داده‌های ورودی نامعتبر' })
  @ApiResponse({ status: 404, description: 'کاربر یافت نشد' })
  create(
    @CurrentUser() user: AuthUserDto,
    @Body() dto: CreateTicketDto,
  ) {
    return this.supportTicketsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست تیکت‌های من (فیلتر status + pagination)' })
  @ApiResponse({ status: 200, description: 'لیست تیکت‌ها با meta pagination' })
  findMine(
    @CurrentUser() user: AuthUserDto,
    @Query() dto: QueryTicketsDto,
  ) {
    return this.supportTicketsService.findMine(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تیکت (همراه با پیام‌های public)' })
  @ApiResponse({ status: 200, description: 'تیکت با پیام‌ها' })
  @ApiResponse({ status: 404, description: 'تیکت یافت نشد یا متعلق به شما نیست' })
  findOne(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.supportTicketsService.findOne(user.id, id);
  }

  @Post(':id/reply')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // ضد spam: حداکثر ۲۰ پاسخ در دقیقه
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'پاسخ به تیکت خودم (auto-reopen اگر RESOLVED بود)' })
  @ApiResponse({ status: 201, description: 'پاسخ ثبت شد' })
  @ApiResponse({ status: 400, description: 'تیکت بسته است یا یادداشت داخلی' })
  @ApiResponse({ status: 404, description: 'تیکت یافت نشد' })
  reply(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportTicketsService.reply(user.id, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بستن تیکت خودم (idempotent)' })
  @ApiResponse({ status: 200, description: 'تیکت بسته شد (یا از قبل بسته بود)' })
  @ApiResponse({ status: 404, description: 'تیکت یافت نشد' })
  close(
    @CurrentUser() user: AuthUserDto,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.supportTicketsService.close(user.id, id);
  }
}