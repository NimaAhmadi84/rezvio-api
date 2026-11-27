import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'لیست اعلان‌های من' })
  async findAll(
    @CurrentUser() user: AuthUserDto,
    @Query() dto: QueryNotificationsDto,
  ) {
    return this.notificationsService.findAll(user.id, dto);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'تعداد اعلان‌های خوانده نشده' })
  async getUnreadCount(@CurrentUser() user: AuthUserDto) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'خواندن یک اعلان' })
  async markAsRead(
    @CurrentUser() user: AuthUserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'خواندن همه اعلان‌ها' })
  async markAllAsRead(@CurrentUser() user: AuthUserDto) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف یک اعلان' })
  async remove(
    @CurrentUser() user: AuthUserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.remove(user.id, id);
  }
}