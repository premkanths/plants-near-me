/**
 * Idempotent seed — safe to re-run (`npm run db:seed`).
 * Creates: 3 platform users, 5 Bengaluru vendors, 7 categories, 20 plants and ~60 products.
 */
import { config } from 'dotenv';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { CATEGORIES, PLANTS, POT_SIZES, VENDORS, VENDOR_CATALOGUE } from './seed/data';

config({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

/** Deterministic pseudo-random so re-seeding produces the same catalogue. */
function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

async function main(): Promise<void> {
  console.log('🌱 Seeding E-PlantShopping 2.0 …');
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  // ── Categories ────────────────────────────────────────────────
  const categories = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, scope: category.scope, description: category.description },
      create: category,
    });
    categories.set(row.slug, row.id);
  }
  console.log(`   ✓ ${categories.size} categories`);

  // ── Platform users ────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@eplant.test' },
    update: {},
    create: {
      email: 'admin@eplant.test',
      name: 'Platform Admin',
      passwordHash,
      role: 'ADMIN',
      phone: '+919800000100',
    },
  });

  const customers = await Promise.all(
    [
      { email: 'customer@eplant.test', name: 'Anitha Rao', phone: '+919800000101' },
      { email: 'customer2@eplant.test', name: 'Vikram Shetty', phone: '+919800000102' },
    ].map((c) =>
      prisma.user.upsert({
        where: { email: c.email },
        update: {},
        create: { ...c, passwordHash, role: 'CUSTOMER' as const },
      }),
    ),
  );

  // Every customer owns exactly one cart
  for (const customer of customers) {
    await prisma.cart.upsert({
      where: { userId: customer.id },
      update: {},
      create: { userId: customer.id },
    });
  }
  console.log(`   ✓ 1 admin, ${customers.length} customers (+ carts)`);

  // ── Plants ────────────────────────────────────────────────────
  const plants = new Map<string, { id: string; commonName: string; basePrice: number }>();
  for (const plant of PLANTS) {
    const { categorySlugs, basePrice, ...fields } = plant;
    const row = await prisma.plant.upsert({
      where: { slug: plant.slug },
      update: fields,
      create: fields,
    });
    plants.set(plant.slug, { id: row.id, commonName: row.commonName, basePrice });

    await prisma.plantCategory.deleteMany({ where: { plantId: row.id } });
    await prisma.plantCategory.createMany({
      data: categorySlugs.map((slug) => ({ plantId: row.id, categoryId: categories.get(slug)! })),
      skipDuplicates: true,
    });
  }
  console.log(`   ✓ ${plants.size} plants`);

  // ── Vendors + products ────────────────────────────────────────
  let productCount = 0;
  for (const vendor of VENDORS) {
    const owner = await prisma.user.upsert({
      where: { email: vendor.email },
      update: {},
      create: {
        email: vendor.email,
        name: vendor.ownerName,
        passwordHash,
        role: 'VENDOR',
        phone: vendor.phone,
      },
    });

    const { email: _e, ownerName: _o, categorySlugs, ...vendorFields } = vendor;
    const row = await prisma.vendor.upsert({
      where: { slug: vendor.slug },
      update: { ...vendorFields, approvedAt: vendor.approved ? new Date() : null },
      create: {
        ...vendorFields,
        userId: owner.id,
        approvedAt: vendor.approved ? new Date() : null,
      },
    });

    await prisma.vendorCategory.deleteMany({ where: { vendorId: row.id } });
    await prisma.vendorCategory.createMany({
      data: categorySlugs.map((slug) => ({ vendorId: row.id, categoryId: categories.get(slug)! })),
      skipDuplicates: true,
    });

    for (const plantSlug of VENDOR_CATALOGUE[vendor.slug] ?? []) {
      const plant = plants.get(plantSlug);
      if (!plant) continue;

      const noise = hashCode(vendor.slug + plantSlug);
      const potSize = POT_SIZES[noise % POT_SIZES.length];
      const sizeMultiplier = 1 + POT_SIZES.indexOf(potSize) * 0.35;
      const price =
        Math.round((plant.basePrice * sizeMultiplier * (0.9 + (noise % 25) / 100)) / 10) * 10;

      await prisma.product.upsert({
        where: {
          vendorId_plantId_potSize: { vendorId: row.id, plantId: plant.id, potSize },
        },
        // Reset the display fields too, so re-seeding is a genuine reset after
        // tests or manual edits have mutated a listing.
        update: {
          title: `${plant.commonName} (${potSize} pot)`,
          description: `${plant.commonName} grown and hardened at ${vendor.name}.`,
          price,
          stock: 5 + (noise % 40),
          active: true,
        },
        create: {
          vendorId: row.id,
          plantId: plant.id,
          title: `${plant.commonName} (${potSize} pot)`,
          description: `${plant.commonName} grown and hardened at ${vendor.name}.`,
          price,
          stock: 5 + (noise % 40),
          potSize,
          images: [],
        },
      });
      productCount++;
    }
  }
  console.log(`   ✓ ${VENDORS.length} vendors, ${productCount} products`);

  // ── Sanity check: PostGIS column populated by the trigger ─────
  const [{ with_location }] = await prisma.$queryRaw<{ with_location: bigint }[]>`
    SELECT COUNT(*) AS with_location FROM vendors WHERE location IS NOT NULL
  `;
  console.log(`   ✓ ${with_location} vendor geography points in sync`);

  console.log(`\n✅ Seed complete. Demo login password for every account: ${DEMO_PASSWORD}`);
  console.log(`   admin:    ${admin.email}`);
  console.log(`   customer: ${customers[0].email}`);
  console.log(`   vendor:   ${VENDORS[0].email}`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
