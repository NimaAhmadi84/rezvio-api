import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { UserRole } from '@prisma/client';
import { BusinessImagesService } from './business-images.service';
import { CreateBusinessImageDto, UpdateBusinessImageDto, ReorderBusinessImagesDto } from './dto';

@ApiTags('Business Images')
@Controller('businesses/:businessId/gallery')
export class BusinessImagesController {
  constructor(private readonly businessImagesService: BusinessImagesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'افزودن تصویر به گالری کسب‌وکار',
    description: 'URL تصویر از endpoint آپلود دریافت شده و اینجا ذخیره می‌شود',
  })
  @ApiResponse({ status: 201, description: 'تصویر اضافه شد' })
  addImage(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: CreateBusinessImageDto,
  ) {
    return this.businessImagesService.addImage(businessId, user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'دریافت گالری تصاویر کسب‌وکار (عمومی)',
  })
  @ApiResponse({ status: 200, description: 'لیست تصاویر' })
  getGallery(@Param('businessId', new ParseUUIDPipe()) businessId: string) {
    return this.businessImagesService.getGallery(businessId);
  }

  @Patch(':imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'ویرایش تصویر (caption یا sortOrder)',
  })
  @ApiResponse({ status: 200, description: 'تصویر ویرایش شد' })
  updateImage(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: UpdateBusinessImageDto,
  ) {
    return this.businessImagesService.updateImage(businessId, imageId, user.id, dto);
  }

  @Delete(':imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'حذف تصویر از گالری',
    description: 'تصویر از Supabase و دیتابیس حذف می‌شود',
  })
  @ApiResponse({ status: 200, description: 'تصویر حذف شد' })
  removeImage(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.businessImagesService.removeImage(businessId, imageId, user.id);
  }

  @Put('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'تغییر ترتیب تصاویر گالری',
  })
  @ApiResponse({ status: 200, description: 'ترتیب تغییر کرد' })
  reorderImages(
    @Param('businessId', new ParseUUIDPipe()) businessId: string,
    @CurrentUser() user: AuthUserDto,
    @Body() dto: ReorderBusinessImagesDto,
  ) {
    return this.businessImagesService.reorderImages(businessId, user.id, dto);
  }
}