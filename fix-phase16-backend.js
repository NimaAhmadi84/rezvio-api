const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// Helper: Read file, detect CRLF, normalize to LF
// ═══════════════════════════════════════════════════════════════
function readAndNormalize(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hadCRLF = content.includes('\r\n');
  const normalized = content.replace(/\r\n/g, '\n');
  return { content, normalized, hadCRLF };
}

function writePreserving(filePath, content, hadCRLF) {
  const toWrite = hadCRLF ? content.replace(/\n/g, '\r\n') : content;
  fs.writeFileSync(filePath, toWrite, 'utf8');
}

// ═══════════════════════════════════════════════════════════════
// Task 1: Add 'since' field to SearchBusinessesDto
// ═══════════════════════════════════════════════════════════════
console.log('\n📦 Task 1: Adding since field to DTO...');

const dtoFile = 'src/businesses/dto/search-businesses.dto.ts';
const dto = readAndNormalize(dtoFile);

const sortField = `  @ApiPropertyOptional({
    description: 'مرتب‌سازی',
    enum: ['newest', 'popular', 'most-viewed', 'name-asc', 'name-desc'],
    default: 'newest',
  })
  @IsString({ message: 'sort باید رشته متنی باشد' })
  @IsOptional()
  @Matches(/^(newest|popular|most-viewed|name-asc|name-desc)$/, {
    message: 'sort باید یکی از: newest, popular, most-viewed, name-asc, name-desc باشد',
  })
  sort?: string;`;

const sinceField = `  @ApiPropertyOptional({
    description: 'فیلتر کسب‌وکارهای ساخته‌شده بعد از این تاریخ (ISO 8601) - برای تب جدیدترین',
    example: '2026-02-18T00:00:00.000Z',
  })
  @IsDateString({}, { message: 'since باید یک تاریخ معتبر ISO 8601 باشد' })
  @IsOptional()
  since?: string;`;

if (dto.normalized.includes(sinceField)) {
  console.log('  ✅ since field already exists in DTO');
} else if (!dto.normalized.includes(sortField)) {
  console.error('  ❌ Could not find sort field in DTO!');
  process.exit(1);
} else {
  const newDto = dto.normalized.replace(sortField, sortField + '\n\n' + sinceField);
  writePreserving(dtoFile, newDto, dto.hadCRLF);
  console.log('  ✅ since field added to SearchBusinessesDto');
}

// ═══════════════════════════════════════════════════════════════
// Task 2: Add 'since' filter to search method
// ═══════════════════════════════════════════════════════════════
console.log('\n📦 Task 2: Adding since filter to search method...');

const serviceFile = 'src/businesses/businesses.service.ts';
const service = readAndNormalize(serviceFile);

const categoryIdFilter = `    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }`;

const sinceFilter = `    if (dto.since) {
      where.createdAt = { gte: new Date(dto.since) };
    }`;

if (service.normalized.includes(sinceFilter)) {
  console.log('  ✅ since filter already exists in search method');
} else if (!service.normalized.includes(categoryIdFilter)) {
  console.error('  ❌ Could not find categoryId filter in search method!');
  process.exit(1);
} else {
  const newService = service.normalized.replace(
    categoryIdFilter,
    categoryIdFilter + '\n\n' + sinceFilter,
  );
  writePreserving(serviceFile, newService, service.hadCRLF);
  console.log('  ✅ since filter added to search method');
}

console.log('\n' + '='.repeat(55));
console.log('📊 Summary:');
console.log('  ✅ Task 1 (DTO since field): DONE');
console.log('  ✅ Task 2 (Service since filter): DONE');
console.log('  ⏸️  Task 3 (bookingsCount): PENDING (waiting for cancel method)');
console.log('='.repeat(55));
