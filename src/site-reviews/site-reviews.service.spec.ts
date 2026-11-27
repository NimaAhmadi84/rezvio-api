import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SiteReview, SiteReviewStatus } from '@prisma/client';
import { SiteReviewsService } from './site-reviews.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit tests برای SiteReviewsService (Phase 29 — نظرات کاربران درباره سایت)
 *
 * تمامการทดสอบ با mock PrismaService انجام می‌شود — هیچ اتصال DB نیاز ندارد.
 */
describe('SiteReviewsService', () => {
  let service: SiteReviewsService;
  let prisma: {
    siteReview: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const USER_ID = 'user-1';
  const REVIEW_ID = 'review-1';

  function makeReview(overrides: Partial<SiteReview> = {}): SiteReview {
    return {
      id: REVIEW_ID,
      userId: USER_ID,
      rating: 5,
      title: 'تجربه‌ی عالی',
      text: 'سایت رزویو تجربه‌ی رزرو بسیار راحتی داشت.',
      status: SiteReviewStatus.PENDING,
      rejectReason: null,
      moderatedBy: null,
      moderatedAt: null,
      createdAt: new Date('2026-11-27T10:00:00.000Z'),
      updatedAt: new Date('2026-11-27T10:00:00.000Z'),
      user: {
        id: USER_ID,
        name: 'نمازی',
      } as any,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      siteReview: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    service = new SiteReviewsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('نظر را با وضعیت PENDING و متن پاک‌سازی‌شده ثبت می‌کند', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(null);
      prisma.siteReview.create.mockResolvedValue(
        makeReview({ text: 'متن پاک‌سازی‌شده', status: SiteReviewStatus.PENDING }),
      );

      const result = await service.create(USER_ID, {
        rating: 5,
        title: ' عالي ',
        text: '  <b>متن پاکی</b>  و خوبی ',
      });

      expect(prisma.siteReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            rating: 5,
            title: 'عالي',
            text: 'متن پاکی و خوبی',
            status: SiteReviewStatus.PENDING,
          }),
        }),
      );
      expect(result.status).toBe(SiteReviewStatus.PENDING);
    });

    it('در صورت وجود نظر قبلی، ۴۰۹ برمی‌گرداند', async () => {
      prisma.siteReview.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(USER_ID, { rating: 4, text: 'متن کامل و معنادار برای تست' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.siteReview.create).not.toHaveBeenCalled();
    });

    it('متن کوتاه‌تر از ۱۰ کاراکتر پس از پاک‌سازی را ۴۰۰ برمی‌گرداند', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { rating: 5, text: '<b>کوتاه</b>' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.siteReview.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('فقط نظرات APPROVED را با summary و meta برمی‌گرداند', async () => {
      prisma.siteReview.findMany
        .mockResolvedValueOnce([{ rating: 5 }, { rating: 4 }]) // خلاصه
        .mockResolvedValueOnce([makeReview({ status: SiteReviewStatus.APPROVED })]); // موارد
      prisma.siteReview.count.mockResolvedValue(2);

      const result = await service.list({});

      expect(prisma.siteReview.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: SiteReviewStatus.APPROVED } }),
      );
      expect(result.summary).toEqual({
        average: 4.5,
        count: 2,
        distribution: [1, 1, 0, 0, 0],
      });
      expect(result.meta.total).toBe(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('نمازی');
    });

    it('فیلتر ستاره و جست‌وجو را اعمال می‌کند', async () => {
      prisma.siteReview.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.siteReview.count.mockResolvedValue(0);

      await service.list({ rating: 5, q: 'تجربه' });

      const countCall = prisma.siteReview.count.mock.calls[0][0];
      expect(countCall.where.rating).toBe(5);
      expect(countCall.where.OR).toHaveLength(2);
    });
  });

  describe('summary', () => {
    it('میانگین، تعداد و توزیع ستاره را محاسبه می‌کند', async () => {
      prisma.siteReview.findMany.mockResolvedValue([
        { rating: 5 },
        { rating: 5 },
        { rating: 3 },
      ]);

      const result = await service.summary();

      expect(result).toEqual({
        average: 4.33,
        count: 3,
        distribution: [2, 0, 1, 0, 0],
      });
    });

    it('در صورت عدم نظر، میانگین صفر برمی‌گرداند', async () => {
      prisma.siteReview.findMany.mockResolvedValue([]);

      const result = await service.summary();

      expect(result).toEqual({
        average: 0,
        count: 0,
        distribution: [0, 0, 0, 0, 0],
      });
    });
  });

  describe('mine', () => {
    it('لیست نظرات کاربر را با همه وضعیت‌ها برمی‌گرداند', async () => {
      prisma.siteReview.findMany.mockResolvedValue([
        makeReview({ status: SiteReviewStatus.REJECTED, rejectReason: 'متن نامناسب' }),
      ]);
      prisma.siteReview.count.mockResolvedValue(1);

      const result = await service.mine(USER_ID);

      expect(prisma.siteReview.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result.items[0].status).toBe(SiteReviewStatus.REJECTED);
      expect(result.items[0].rejectReason).toBe('متن نامناسب');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('نظر یافتن نمی‌شود → ۴۰۴', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(null);

      await expect(service.findOne(REVIEW_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('نظر APPROVED برای همه قابل مشاهده است', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(
        makeReview({ status: SiteReviewStatus.APPROVED }),
      );

      const result = await service.findOne(REVIEW_ID, 'someone-else');
      expect(result.id).toBe(REVIEW_ID);
    });

    it('نظر غير APPROVED برای دیگران دیده نمی‌شود (۴۰۴)', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(
        makeReview({ status: SiteReviewStatus.PENDING }),
      );

      await expect(service.findOne(REVIEW_ID, 'someone-else')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('نظر غير APPROVED برای خود صاحب قابل مشاهده است', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(
        makeReview({ status: SiteReviewStatus.REJECTED, rejectReason: 'دلیل' }),
      );

      const result = await service.findOne(REVIEW_ID, USER_ID);
      expect(result.status).toBe(SiteReviewStatus.REJECTED);
    });
  });

  describe('update', () => {
    it('غیر owner نمی‌تواند ویرایش کند → ۴۰۳', async () => {
      prisma.siteReview.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: 'other-user' });

      await expect(
        service.update('other-user-requester', REVIEW_ID, { rating: 4, text: 'متن کامل و معنادار' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.siteReview.update).not.toHaveBeenCalled();
    });

    it('owner ویرایش می‌کند و وضعیت دوباره PENDING می‌شود', async () => {
      prisma.siteReview.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: USER_ID });
      prisma.siteReview.update.mockResolvedValue(
        makeReview({
          status: SiteReviewStatus.PENDING,
          rejectReason: null,
          moderatedBy: null,
          moderatedAt: null,
        }),
      );

      const result = await service.update(USER_ID, REVIEW_ID, {
        rating: 4,
        text: 'متن کامل و معنادار برای ویرایش',
      });

      expect(prisma.siteReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({
            rating: 4,
            status: SiteReviewStatus.PENDING,
            rejectReason: null,
          }),
        }),
      );
      expect(result.status).toBe(SiteReviewStatus.PENDING);
    });

    it('نظر یافتن نمی‌شود → ۴۰۴', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, REVIEW_ID, { rating: 4, text: 'متن کامل و معنادار' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('غیر owner نمی‌تواند حذف کند → ۴۰۳', async () => {
      prisma.siteReview.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: 'other-user' });

      await expect(service.remove('other-user-requester', REVIEW_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prisma.siteReview.delete).not.toHaveBeenCalled();
    });

    it('owner نظر را حذف می‌کند', async () => {
      prisma.siteReview.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: USER_ID });
      prisma.siteReview.delete.mockResolvedValue({ id: REVIEW_ID });

      const result = await service.remove(USER_ID, REVIEW_ID);

      expect(prisma.siteReview.delete).toHaveBeenCalledWith({ where: { id: REVIEW_ID } });
      expect(result.message).toBe('نظر حذف شد');
    });

    it('نظر یافتن نمی‌شود → ۴۰۴', async () => {
      prisma.siteReview.findUnique.mockResolvedValue(null);

      await expect(service.remove(USER_ID, REVIEW_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
