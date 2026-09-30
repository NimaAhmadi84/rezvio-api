import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeText } from '../common/utils/sanitize.util';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { ReviewVoteKind } from '@prisma/client';

@Injectable()
export class BusinessReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * بررسی وجود کسب‌وکار
   */
  private async ensureBusinessExists(businessId: string): Promise<void> {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!b) throw new NotFoundException('کسب‌وکار یافت نشد');
  }

  /**
   * ایجاد نظر — هر کاربر فقط یک نظر per کسب‌وکار (unique constraint)
   */
  async create(businessId: string, userId: string, dto: CreateReviewDto) {
    await this.ensureBusinessExists(businessId);

    const sanitized = sanitizeText(dto.text);
    if (sanitized.length < 5) {
      throw new BadRequestException(
        'متن نظر پس از پاک‌سازی کمتر از ۵ کاراکتر است',
      );
    }

    // نظر چندگانه per user مجاز است (طبق تصمیم صاحب پروژه)
    return this.prisma.businessReview.create({
      data: {
        businessId,
        userId,
        rating: dto.rating,
        text: sanitized,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * لیست نظرات با فیلتر + جست‌وجو + مرتب‌سازی + pagination
   * summary (میانگین + توزیع) مستقل از pagination محاسبه می‌شود
   */
  async list(businessId: string, query: QueryReviewsDto, currentUserId?: string) {
    await this.ensureBusinessExists(businessId);

    const rating = query.rating;
    const sort = query.sort || 'newest';
    const q = query.q?.trim();
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // ──── where clause ────
    const where: any = { businessId };
    if (rating) where.rating = rating;
    if (q) {
      where.OR = [
        { text: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // ──── orderBy ────
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'highest') orderBy = [{ rating: 'desc' }, { createdAt: 'desc' }];
    else if (sort === 'lowest') orderBy = [{ rating: 'asc' }, { createdAt: 'desc' }];
    else if (sort === 'helpful') {
      // helpful = بیشترین likes - dislikes
      // چون Prisma مستقیم روی relation count aggregate نمی‌تواند sort کند،
      // همه را می‌گیریم و در memory sort می‌کنیم (برای scale بالا در آینده raw SQL)
      orderBy = { createdAt: 'desc' }; // placeholder — بعد از fetch sort می‌کنیم
    }

    // ──── Summary (مستقل از pagination) ────
    const [summaryReviews, count] = await Promise.all([
      this.prisma.businessReview.findMany({
        where: { businessId },
        select: { rating: true },
      }),
      this.prisma.businessReview.count({ where }),
    ]);

    const distribution = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const r of summaryReviews) {
      sum += r.rating;
      distribution[5 - r.rating] += 1;
    }
    const summary = {
      average: summaryReviews.length ? Number((sum / summaryReviews.length).toFixed(2)) : 0,
      count: summaryReviews.length,
      distribution,
    };

    // ──── Fetch reviews با votes ────
    let items = await this.prisma.businessReview.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        votes: { select: { userId: true, kind: true } },
        replies: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy,
      skip: sort === 'helpful' ? 0 : skip, // برای helpful همه را می‌گیریم
      take: sort === 'helpful' ? 1000 : limit, // سقف ۱۰۰۰ برای sort در memory
    });

    // ──── Helpful sort در memory ────
    if (sort === 'helpful') {
      items.sort((a, b) => {
        const scoreA = a.votes.filter((v) => v.kind === 'LIKE').length -
                       a.votes.filter((v) => v.kind === 'DISLIKE').length;
        const scoreB = b.votes.filter((v) => v.kind === 'LIKE').length -
                       b.votes.filter((v) => v.kind === 'DISLIKE').length;
        return scoreB - scoreA;
      });
      items = items.slice(skip, skip + limit);
    }

    // ──── نرمال‌سازی خروجی (برای سازگاری با frontend) ────
    const normalized = items.map((r) => {
      const likes = r.votes.filter((v) => v.kind === 'LIKE').length;
      const dislikes = r.votes.filter((v) => v.kind === 'DISLIKE').length;
      const myVote: 'LIKE' | 'DISLIKE' | null =
        currentUserId
          ? r.votes.find((v) => v.userId === currentUserId)?.kind ?? null
          : null;

      return {
        id: r.id,
        userId: r.userId,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,
        name: r.user.name || 'کاربر رزویو',
        likes,
        dislikes,
        myVote,
        reply: r.replies[0] || null,
      };
    });

    const totalPages = Math.ceil(count / limit) || 1;
    const meta = {
      total: count,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    return { items: normalized, meta, summary };
  }

  /**
   * رأی مفید / مفید نبود — toggle هوشمند:
   * رأی تکراری = حذف، رأی متضاد = جایگزینی
   */
  async vote(businessId: string, reviewId: string, userId: string, kind: ReviewVoteKind) {
    // بررسی تعلق نظر به کسب‌وکار + self-vote block
    const review = await this.prisma.businessReview.findUnique({
      where: { id: reviewId },
      select: { businessId: true, userId: true },
    });
    if (!review) throw new NotFoundException('نظر یافت نشد');
    if (review.businessId !== businessId) {
      throw new ForbiddenException('این نظر متعلق به این کسب‌وکار نیست');
    }
    if (review.userId === userId) {
      throw new ForbiddenException('نمی‌توانید به نظر خودتان رأی دهید');
    }

        // پیدا کردن رأی فعلی
    const existing = await this.prisma.reviewVote.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });

    if (existing) {
      if (existing.kind === kind) {
        // رأی تکراری → حذف
        await this.prisma.reviewVote.delete({ where: { id: existing.id } });
        return this.getVoteStatus(reviewId, userId);
      } else {
        // رأی متضاد → جایگزینی
        await this.prisma.reviewVote.update({
          where: { id: existing.id },
          data: { kind },
        });
        return this.getVoteStatus(reviewId, userId);
      }
    } else {
      await this.prisma.reviewVote.create({
        data: { userId, reviewId, kind },
      });
      return this.getVoteStatus(reviewId, userId);
    }
  }

  private async getVoteStatus(reviewId: string, userId?: string) {
    const votes = await this.prisma.reviewVote.findMany({
      where: { reviewId },
      select: { userId: true, kind: true },
    });
    const likes = votes.filter((v) => v.kind === 'LIKE').length;
    const dislikes = votes.filter((v) => v.kind === 'DISLIKE').length;
    const myVote: 'LIKE' | 'DISLIKE' | null =
      userId ? votes.find((v) => v.userId === userId)?.kind ?? null : null;
    return { likes, dislikes, myVote };
  }

  /**
   * پاسخ صاحب کسب‌وکار — فقط OWNER این کسب‌وکار
   * هر نظر فقط یک پاسخ می‌تواند داشته باشد (reviewId @unique)
   */
  async reply(
    businessId: string,
    reviewId: string,
    userId: string,
    text: string,
    ownerName: string | null,
  ) {
    // ownership check
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, name: true },
    });
    if (!business) throw new NotFoundException('کسب‌وکار یافت نشد');
    if (business.ownerId !== userId) {
      throw new ForbiddenException('فقط صاحب کسب‌وکار می‌تواند پاسخ دهد');
    }

    // بررسی تعلق نظر
    const review = await this.prisma.businessReview.findUnique({
      where: { id: reviewId },
      select: { businessId: true, id: true },
    });
    if (!review) throw new NotFoundException('نظر یافت نشد');
    if (review.businessId !== businessId) {
      throw new ForbiddenException('این نظر متعلق به این کسب‌وکار نیست');
    }

    // بررسی عدم وجود پاسخ قبلی
    const existingReply = await this.prisma.reviewReply.findUnique({
      where: { reviewId },
    });
    if (existingReply) {
      throw new ConflictException('این نظر قبلاً پاسخ داده شده است');
    }

    const sanitized = sanitizeText(text);
    if (sanitized.length < 5) {
      throw new BadRequestException(
        'متن پاسخ پس از پاک‌سازی کمتر از ۵ کاراکتر است',
      );
    }

    return this.prisma.reviewReply.create({
      data: { reviewId, text: sanitized },
    });
  }
}