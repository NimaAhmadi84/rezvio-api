import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { BusinessesService } from '../businesses/businesses.service';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async create(userId: string, dto: CreateServiceDto) {
    // بررسی مالکیت business
    await this.businessesService.checkOwnership(dto.businessId, userId);

    const service = await this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        businessId: dto.businessId,
      },
    });

    return service;
  }

  async findAll(businessId?: string) {
    const where = businessId ? { businessId } : {};

    return this.prisma.service.findMany({
      where,
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        staff: {
          include: {
            staff: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        staff: {
          include: {
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد');
    }

    return service;
  }

  async update(id: string, userId: string, dto: UpdateServiceDto) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد');
    }

    // بررسی مالکیت business
    await this.businessesService.checkOwnership(service.businessId, userId);

    const updated = await this.prisma.service.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد');
    }

    // بررسی مالکیت business
    await this.businessesService.checkOwnership(service.businessId, userId);

    await this.prisma.service.delete({
      where: { id },
    });

    return { message: 'خدمت با موفقیت حذف شد' };
  }
}
