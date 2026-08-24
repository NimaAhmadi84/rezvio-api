import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateBusinessImageDto } from './dto/create-business-image.dto';
import { UpdateBusinessImageDto } from './dto/update-business-image.dto';
import { ReorderBusinessImagesDto } from './dto/reorder-business-images.dto';

@Injectable()
export class BusinessImagesService {
  private readonly logger = new Logger(BusinessImagesService.name);
  private readonly MAX_IMAGES_PER_BUSINESS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * بررسی مالکیت کسب‌وکار (دفاع در عمق)
   */
  private async checkOwnership(businessId: string, userId: string): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    if (business.ownerId !== userId) {
      throw new ForbiddenException('شما مالک این کسب‌وکار نیستید');
    }
  }

  /**
   * دریافت تعداد تصاویر فعلی
   */
  private async getImageCount(businessId: string): Promise<number> {
    return this.prisma.businessImage.count({
      where: { businessId },
    });
  }

  /**
   * استخراج مسیر فایل از URL Supabase
   */
  private extractPathFromUrl(url: string): string | null {
    // URL format: https://xxx.supabase.co/storage/v1/object/public/business-logos/user-id/filename.webp
    const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * افزودن تصویر به گالری
   */
  async addImage(businessId: string, userId: string, dto: CreateBusinessImageDto) {
    await this.checkOwnership(businessId, userId);

    // بررسی محدودیت تعداد تصاویر
    const currentCount = await this.getImageCount(businessId);
    if (currentCount >= this.MAX_IMAGES_PER_BUSINESS) {
      throw new BadRequestException(
        `حداکثر ${this.MAX_IMAGES_PER_BUSINESS} تصویر می‌توانید اضافه کنید`,
      );
    }

    // اگه sortOrder داده نشده، بزرگترین sortOrder فعلی + ۱
    let sortOrder = dto.sortOrder ?? 0;
    if (dto.sortOrder === undefined) {
      const maxSort = await this.prisma.businessImage.findFirst({
        where: { businessId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (maxSort?.sortOrder ?? -1) + 1;
    }

    const image = await this.prisma.businessImage.create({
      data: {
        url: dto.url,
        caption: dto.caption,
        sortOrder,
        businessId,
      },
    });

    this.logger.log(`✅ Image added to business ${businessId}: ${image.id}`);
    return image;
  }

  /**
   * دریافت همه تصاویر گالری یک کسب‌وکار (عمومی)
   */
  async getGallery(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('کسب‌وکار یافت نشد');
    }

    return this.prisma.businessImage.findMany({
      where: { businessId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * ویرایش تصویر (caption یا sortOrder)
   */
  async updateImage(
    businessId: string,
    imageId: string,
    userId: string,
    dto: UpdateBusinessImageDto,
  ) {
    await this.checkOwnership(businessId, userId);

    const image = await this.prisma.businessImage.findUnique({
      where: { id: imageId },
      select: { businessId: true },
    });

    if (!image || image.businessId !== businessId) {
      throw new NotFoundException('تصویر یافت نشد');
    }

    const data: any = {};
    if (dto.caption !== undefined) data.caption = dto.caption;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const updated = await this.prisma.businessImage.update({
      where: { id: imageId },
      data,
    });

    this.logger.log(`✅ Image updated: ${imageId}`);
    return updated;
  }

  /**
   * حذف تصویر از گالری (با cleanup از Supabase)
   */
  async removeImage(businessId: string, imageId: string, userId: string) {
    await this.checkOwnership(businessId, userId);

    const image = await this.prisma.businessImage.findUnique({
      where: { id: imageId },
    });

    if (!image || image.businessId !== businessId) {
      throw new NotFoundException('تصویر یافت نشد');
    }

    // حذف از Supabase
    const path = this.extractPathFromUrl(image.url);
    if (path) {
      await this.uploadService.deleteImage(path);
    }

    // حذف از دیتابیس
    await this.prisma.businessImage.delete({
      where: { id: imageId },
    });

    this.logger.log(`🗑️ Image removed: ${imageId}`);
    return { message: 'تصویر با موفقیت حذف شد' };
  }

  /**
   * تغییر ترتیب تصاویر (bulk reorder)
   */
  async reorderImages(businessId: string, userId: string, dto: ReorderBusinessImagesDto) {
    await this.checkOwnership(businessId, userId);

    // بررسی همه تصاویر متعلق به این کسب‌وکار هستند
    const imageIds = dto.images.map((i) => i.id);
    const existingImages = await this.prisma.businessImage.findMany({
      where: {
        id: { in: imageIds },
        businessId,
      },
      select: { id: true },
    });

    if (existingImages.length !== imageIds.length) {
      throw new BadRequestException('برخی از تصاویر یافت نشدند یا متعلق به این کسب‌وکار نیستند');
    }

    // آپدیت sortOrder برای هر تصویر
    await this.prisma.$transaction(
      dto.images.map((item) =>
        this.prisma.businessImage.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    this.logger.log(`✅ Images reordered for business ${businessId}`);
    return this.getGallery(businessId);
  }
}