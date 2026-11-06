import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════
// 📂 دسته‌بندی‌های پیش‌فرض کسب‌وکارها (نسخه نهایی - 2026-10-18)
// ═══════════════════════════════════════════════════════════════
const defaultCategories = [
  // ──── زیبایی و سلامت ────
  { name: 'آرایشگاه مردانه', slug: 'barber', icon: '✂️', sortOrder: 1 },
  { name: 'سالن زیبایی زنانه', slug: 'beauty-salon', icon: '💇‍♀️', sortOrder: 2 },
  { name: 'ماساژ و اسپا', slug: 'spa', icon: '💆', sortOrder: 3 },
  { name: 'ورزش و تناسب اندام', slug: 'fitness', icon: '🏋️', sortOrder: 4 },
  // ──── پزشکی و سلامت ────
  { name: 'کلینیک و مطب پزشکی', slug: 'clinic', icon: '🏥', sortOrder: 5 },
  { name: 'دندانپزشکی', slug: 'dental', icon: '🦷', sortOrder: 6 },
  { name: 'فیزیوتراپی و توانبخشی', slug: 'physiotherapy', icon: '🩺', sortOrder: 7 },
  { name: 'دامپزشکی و خدمات حیوانات', slug: 'veterinary', icon: '🐾', sortOrder: 8 },
  // ──── آموزش، مشاوره و حقوقی ────
  { name: 'آموزشگاه و تدریس خصوصی', slug: 'education', icon: '📚', sortOrder: 9 },
  { name: 'مشاوره و روانشناسی', slug: 'consulting', icon: '💼', sortOrder: 10 },
  { name: 'حقوقی و وکالت', slug: 'legal', icon: '⚖️', sortOrder: 11 },
  // ──── خدمات فنی و خودرویی ────
  { name: 'تعمیرات و خدمات فنی', slug: 'repair', icon: '🔧', sortOrder: 12 },
  { name: 'خودرو و خدمات خودرویی', slug: 'automotive', icon: '🚗', sortOrder: 13 },
  // ──── food & beverage ────
  { name: 'رستوران و کافه', slug: 'restaurant', icon: '🍽️', sortOrder: 14 },
  // ──── creative & other ────
  { name: 'عکاسی و فیلمبرداری', slug: 'photography', icon: '📷', sortOrder: 15 },
  { name: 'سایر', slug: 'other', icon: '📌', sortOrder: 99 },
];

// ═══════════════════════════════════════════════════════════════
// 🛡️ Admin RBAC — Permissions (Phase 24)
// ═══════════════════════════════════════════════════════════════
const defaultPermissions = [
  // User management
  { code: 'user:view',        module: 'user', action: 'view',        description: 'مشاهده لیست و جزئیات کاربران' },
  { code: 'user:update',      module: 'user', action: 'update',      description: 'ویرایش اطلاعات کاربران' },
  { code: 'user:delete',      module: 'user', action: 'delete',      description: 'حذف کاربران' },
  { code: 'user:ban',         module: 'user', action: 'ban',         description: 'مسدود کردن کاربران' },
  { code: 'user:impersonate', module: 'user', action: 'impersonate', description: 'ورود به حساب کاربران (فقط Super Admin)' },

  // Business management
  { code: 'business:view',     module: 'business', action: 'view',     description: 'مشاهده کسب‌وکارها' },
  { code: 'business:update',   module: 'business', action: 'update',   description: 'ویرایش کسب‌وکارها' },
  { code: 'business:delete',   module: 'business', action: 'delete',   description: 'حذف کسب‌وکارها' },
  { code: 'business:approve',  module: 'business', action: 'approve',  description: 'تأیید/رد کسب‌وکارهای جدید' },

  // Booking management
  { code: 'booking:view',          module: 'booking', action: 'view',          description: 'مشاهده رزروها' },
  { code: 'booking:update',        module: 'booking', action: 'update',        description: 'ویرایش رزروها' },
  { code: 'booking:cancel',        module: 'booking', action: 'cancel',        description: 'لغو رزروها' },
  { code: 'booking:change-status', module: 'booking', action: 'change-status', description: 'تغییر وضعیت رزروها' },

  // Category management
  { code: 'category:view',   module: 'category', action: 'view',   description: 'مشاهده دسته‌بندی‌ها' },
  { code: 'category:create', module: 'category', action: 'create', description: 'ایجاد دسته‌بندی جدید' },
  { code: 'category:update', module: 'category', action: 'update', description: 'ویرایش دسته‌بندی‌ها' },
  { code: 'category:delete', module: 'category', action: 'delete', description: 'حذف دسته‌بندی‌ها' },

  // Admin management
  { code: 'admin:view',   module: 'admin', action: 'view',   description: 'مشاهده لیست ادمین‌ها' },
  { code: 'admin:create', module: 'admin', action: 'create', description: 'ایجاد ادمین جدید' },
  { code: 'admin:update', module: 'admin', action: 'update', description: 'ویرایش دسترسی‌های ادمین‌ها' },
  { code: 'admin:delete', module: 'admin', action: 'delete', description: 'حذف ادمین‌ها' },

  // Reports
  { code: 'report:view',   module: 'report', action: 'view',   description: 'مشاهده گزارش‌ها' },
  { code: 'report:export', module: 'report', action: 'export', description: 'خروجی گرفتن از گزارش‌ها' },

  // Settings
  { code: 'settings:view',   module: 'settings', action: 'view',   description: 'مشاهده تنظیمات سایت' },
  { code: 'settings:update', module: 'settings', action: 'update', description: 'ویرایش تنظیمات سایت' },
];

// ═══════════════════════════════════════════════════════════════
// 🎭 Admin RBAC — Default Roles (Phase 24)
// ═══════════════════════════════════════════════════════════════
const defaultRoles = [
  {
    name: 'Super Admin',
    description: 'دسترسی کامل به همه‌ی بخش‌ها (مالک سایت)',
    isSystem: true,
    permissions: 'all' as const, // همه‌ی مجوزها
  },
  {
    name: 'Booking Manager',
    description: 'مدیریت کامل رزروها + مشاهده کاربران',
    isSystem: true,
    permissions: [
      'booking:view', 'booking:update', 'booking:cancel', 'booking:change-status',
      'user:view',
    ],
  },
  {
    name: 'Business Manager',
    description: 'مدیریت کسب‌وکارها و مشاهده دسته‌بندی‌ها',
    isSystem: true,
    permissions: [
      'business:view', 'business:update', 'business:delete', 'business:approve',
      'category:view',
    ],
  },
  {
    name: 'Support Agent',
    description: 'پاسخگویی به کاربران و مدیریت نوبت‌ها',
    isSystem: true,
    permissions: [
      'user:view',
      'booking:view', 'booking:change-status',
    ],
  },
  {
    name: 'Content Manager',
    description: 'مدیریت دسته‌بندی‌ها و محتوا',
    isSystem: true,
    permissions: [
      'category:view', 'category:create', 'category:update', 'category:delete',
      'business:view',
    ],
  },
];

async function main() {
  console.log('🌱 شروع فرآیند Seed کردن دیتابیس Rezvio...');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // 📂 Seed دسته‌بندی‌ها
  // ═══════════════════════════════════════════════════════════════
  console.log('📂 ساخت/به‌روزرسانی دسته‌بندی‌های پیش‌فرض:');
  let categoriesCreated = 0;
  let categoriesUpdated = 0;

  for (const cat of defaultCategories) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (existing) {
      await prisma.category.update({
        where: { slug: cat.slug },
        data: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      });
      categoriesUpdated++;
    } else {
      await prisma.category.create({ data: cat });
      categoriesCreated++;
    }
  }
  console.log(`   ✅ ${categoriesCreated} دسته جدید، ♻️ ${categoriesUpdated} دسته به‌روزرسانی شد`);

  // ═══════════════════════════════════════════════════════════════
  // 🛡️ Seed Permissions
  // ═══════════════════════════════════════════════════════════════
  console.log('');
  console.log('🛡️ ساخت مجوزها (Permissions):');
  let permissionsCreated = 0;
  let permissionsUpdated = 0;

  for (const perm of defaultPermissions) {
    const existing = await prisma.permission.findUnique({ where: { code: perm.code } });
    if (existing) {
      await prisma.permission.update({
        where: { code: perm.code },
        data: { description: perm.description, module: perm.module, action: perm.action },
      });
      permissionsUpdated++;
    } else {
      await prisma.permission.create({ data: perm });
      permissionsCreated++;
    }
  }
  console.log(`   ✅ ${permissionsCreated} مجوز جدید، ♻️ ${permissionsUpdated} مجوز به‌روزرسانی شد`);

  // ═══════════════════════════════════════════════════════════════
  // 🎭 Seed Roles + Link Permissions
  // ═══════════════════════════════════════════════════════════════
  console.log('');
  console.log('🎭 ساخت نقش‌ها و اتصال مجوزها:');

  // Load all permissions for "all" role
  const allPermissions = await prisma.permission.findMany();

  for (const roleDef of defaultRoles) {
    const existingRole = await prisma.adminRole.findUnique({ where: { name: roleDef.name } });

    let role;
    if (existingRole) {
      role = await prisma.adminRole.update({
        where: { name: roleDef.name },
        data: { description: roleDef.description, isSystem: roleDef.isSystem },
      });
      console.log(`   ♻️  نقش "${roleDef.name}" از قبل وجود داشت`);
    } else {
      role = await prisma.adminRole.create({
        data: {
          name: roleDef.name,
          description: roleDef.description,
          isSystem: roleDef.isSystem,
        },
      });
      console.log(`   ✅ نقش "${roleDef.name}" ایجاد شد`);
    }

    // Determine which permissions to assign
    const permissionCodes =
      roleDef.permissions === 'all'
        ? allPermissions.map((p) => p.code)
        : roleDef.permissions;

    const permissionRecords = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    // Wipe old links for this role, then re-create
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionRecords.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
    console.log(`      ↳ ${permissionRecords.length} مجوز به این نقش متصل شد`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 👑 ساخت / Link کردن Super Admin
  // ═══════════════════════════════════════════════════════════════
  console.log('');
  console.log('👑 ساخت / تنظیم Super Admin:');
  const adminEmail = 'mrnima2920@gmail.com';

  let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!adminUser) {
    console.log(`   📧 ایجاد کاربر ادمین: ${adminEmail}`);
    const hashedPassword = await bcrypt.hash('NimaAhmadi$_84', 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Nima Ahmadi',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log(`   ✅ کاربر ادمین ساخته شد (ID: ${adminUser.id})`);
  } else {
    // Ensure role is ADMIN
    if (adminUser.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: 'ADMIN' },
      });
      console.log(`   ♻️  نقش کاربر به ADMIN ارتقا یافت`);
    } else {
      console.log(`   ℹ️  کاربر ادمین از قبل وجود دارد (role=ADMIN)`);
    }
  }

  // Link user to Super Admin role
  const superAdminRole = await prisma.adminRole.findUnique({
    where: { name: 'Super Admin' },
  });

  if (!superAdminRole) {
    throw new Error('Super Admin role not found — abort');
  }

  const existingAdminProfile = await prisma.admin.findUnique({
    where: { userId: adminUser.id },
  });

  if (!existingAdminProfile) {
    await prisma.admin.create({
      data: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
        isActive: true,
        createdBy: null, // سیستم (اولین ادمین)
      },
    });
    console.log(`   ✅ Admin profile متصل به نقش "Super Admin" ایجاد شد`);
  } else {
    // Ensure role is Super Admin + isActive
    await prisma.admin.update({
      where: { userId: adminUser.id },
      data: { roleId: superAdminRole.id, isActive: true },
    });
    console.log(`   ♻️  Admin profile بروزرسانی شد (نقش: Super Admin)`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 Seed با موفقیت انجام شد!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 خلاصه:`);
  console.log(`   - ${defaultCategories.length} دسته‌بندی`);
  console.log(`   - ${defaultPermissions.length} مجوز (Permission)`);
  console.log(`   - ${defaultRoles.length} نقش (Role)`);
  console.log(`   - ۱ ادمین کل: ${adminEmail}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
