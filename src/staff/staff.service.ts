import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { BusinessesService } from '../businesses/businesses.service';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async create(userId: string, dto: CreateStaffDto) {
    await this.businessesService.checkOwnership(dto.businessId, userId);

    const staff = await this.prisma.staff.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        businessId: dto.businessId,
      },
    });

    return staff;
  }

  async findAll(businessId?: string) {
    const where = businessId ? { businessId } : {};

    return this.prisma.staff.findMany({
      where,
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                durationMinutes: true,
                price: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                durationMinutes: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    return staff;
  }

  async update(id: string, userId: string, dto: UpdateStaffDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    await this.businessesService.checkOwnership(staff.businessId, userId);

    const updated = await this.prisma.staff.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    await this.businessesService.checkOwnership(staff.businessId, userId);

    await this.prisma.staff.delete({
      where: { id },
    });

    return { message: 'کارمند با موفقیت حذف شد' };
  }

  async assignService(staffId: string, serviceId: string, userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { businessId: true },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    await this.businessesService.checkOwnership(staff.businessId, userId);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { businessId: true },
    });

    if (!service) {
      throw new NotFoundException('خدمت یافت نشد');
    }

    if (service.businessId !== staff.businessId) {
      throw new ForbiddenException('این خدمت متعلق به این کسب‌وکار نیست');
    }

    const existing = await this.prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('این خدمت قبلاً به این کارمند اختصاص داده شده است');
    }

    const staffService = await this.prisma.staffService.create({
      data: {
        staffId,
        serviceId,
      },
    });

    return staffService;
  }

  async unassignService(staffId: string, serviceId: string, userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { businessId: true },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    await this.businessesService.checkOwnership(staff.businessId, userId);

    const existing = await this.prisma.staffService.findUnique({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('این خدمت به این کارمند اختصاص داده نشده است');
    }

    await this.prisma.staffService.delete({
      where: {
        staffId_serviceId: {
          staffId,
          serviceId,
        },
      },
    });

    return { message: 'خدمت با موفقیت از کارمند حذف شد' };
  }

  async getAssignedServices(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                description: true,
                durationMinutes: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    return staff.services.map((ss) => ss.service);
  }
}
