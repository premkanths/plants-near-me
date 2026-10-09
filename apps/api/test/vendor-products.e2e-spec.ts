import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The security test for Step 4: two real vendors, each with their own product,
 * proving that vendor A can never read, edit, restock or delete vendor B's data.
 * Requires a running database with migrations + seed applied.
 */
describe('Vendor products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const vendorA = { email: `vendor-a-${stamp}@eplant.test`, password: 'Password123!', token: '' };
  const vendorB = { email: `vendor-b-${stamp}@eplant.test`, password: 'Password123!', token: '' };
  const customer = { email: `cust-${stamp}@eplant.test`, password: 'Password123!', token: '' };

  let plantId: string;
  let productA = '';
  let productB = '';

  const server = () => app.getHttpServer();

  const registerVendor = async (account: typeof vendorA, shopName: string) => {
    const res = await request(server())
      .post('/api/auth/register/vendor')
      .send({
        email: account.email,
        password: account.password,
        name: shopName + ' Owner',
        vendor: { name: shopName, latitude: 12.97, longitude: 77.59, city: 'Bengaluru' },
      })
      .expect(201);
    account.token = res.body.accessToken;
    return res.body.user.vendor.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await registerVendor(vendorA, `Isolation Shop A ${stamp}`);
    await registerVendor(vendorB, `Isolation Shop B ${stamp}`);

    const reg = await request(server())
      .post('/api/auth/register')
      .send({ email: customer.email, password: customer.password, name: 'Curious Customer' })
      .expect(201);
    customer.token = reg.body.accessToken;

    const plant = await prisma.plant.findFirstOrThrow({ select: { id: true } });
    plantId = plant.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [vendorA.email, vendorB.email, customer.email] } },
    });
    await app?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('CRUD for your own products', () => {
    it('creates a product', async () => {
      const res = await request(server())
        .post('/api/vendor/products')
        .set(auth(vendorA.token))
        .send({ plantId, title: 'Shop A Monstera', price: 899.5, stock: 10, potSize: '8 inch' })
        .expect(201);

      productA = res.body.id;
      expect(res.body.price).toBe('899.5');
      expect(res.body.plant.commonName).toEqual(expect.any(String));
    });

    it('creates a product for the other vendor too', async () => {
      const res = await request(server())
        .post('/api/vendor/products')
        .set(auth(vendorB.token))
        .send({ plantId, title: 'Shop B Monstera', price: 799, stock: 4, potSize: '8 inch' })
        .expect(201);
      productB = res.body.id;
    });

    it('lists only your own products', async () => {
      const res = await request(server())
        .get('/api/vendor/products')
        .set(auth(vendorA.token))
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe('Shop A Monstera');
    });

    it('reports inventory stats for your own shop only', async () => {
      const res = await request(server())
        .get('/api/vendor/products/stats')
        .set(auth(vendorA.token))
        .expect(200);

      expect(res.body).toMatchObject({ total: 1, active: 1, outOfStock: 0 });
      expect(res.body.inventoryValue).toBeCloseTo(8995, 2); // 899.50 × 10
    });

    it('updates its price', async () => {
      const res = await request(server())
        .patch(`/api/vendor/products/${productA}`)
        .set(auth(vendorA.token))
        .send({ price: 999 })
        .expect(200);
      expect(res.body.price).toBe('999');
    });

    it('updates its stock', async () => {
      const res = await request(server())
        .patch(`/api/vendor/products/${productA}/stock`)
        .set(auth(vendorA.token))
        .send({ stock: 25 })
        .expect(200);
      expect(res.body.stock).toBe(25);
    });

    it('rejects a duplicate plant + pot size with 409', async () => {
      await request(server())
        .post('/api/vendor/products')
        .set(auth(vendorA.token))
        .send({ plantId, title: 'Duplicate', price: 100, stock: 1, potSize: '8 inch' })
        .expect(409);
    });

    it('rejects invalid input with 400', async () => {
      await request(server())
        .post('/api/vendor/products')
        .set(auth(vendorA.token))
        .send({ plantId, title: '', price: -5, stock: 1.5 })
        .expect(400);
    });
  });

  describe('a vendor can NEVER touch another vendor’s data', () => {
    it('cannot read it (403)', async () => {
      await request(server())
        .get(`/api/vendor/products/${productB}`)
        .set(auth(vendorA.token))
        .expect(403);
    });

    it('cannot update it (403) and the data is unchanged', async () => {
      await request(server())
        .patch(`/api/vendor/products/${productB}`)
        .set(auth(vendorA.token))
        .send({ price: 1 })
        .expect(403);

      const untouched = await prisma.product.findUniqueOrThrow({ where: { id: productB } });
      expect(untouched.price.toString()).toBe('799');
    });

    it('cannot restock it (403) and the stock is unchanged', async () => {
      await request(server())
        .patch(`/api/vendor/products/${productB}/stock`)
        .set(auth(vendorA.token))
        .send({ stock: 9999 })
        .expect(403);

      const untouched = await prisma.product.findUniqueOrThrow({ where: { id: productB } });
      expect(untouched.stock).toBe(4);
    });

    it('cannot delete it (403) and the row still exists', async () => {
      await request(server())
        .delete(`/api/vendor/products/${productB}`)
        .set(auth(vendorA.token))
        .expect(403);

      expect(await prisma.product.count({ where: { id: productB } })).toBe(1);
    });

    it('cannot smuggle a vendorId through the request body', async () => {
      // `forbidNonWhitelisted` rejects unknown properties outright
      await request(server())
        .post('/api/vendor/products')
        .set(auth(vendorA.token))
        .send({
          plantId,
          title: 'Smuggled',
          price: 10,
          stock: 1,
          potSize: '99 inch',
          vendorId: 'x',
        })
        .expect(400);
    });
  });

  describe('role enforcement', () => {
    it('blocks customers from the vendor API (403)', async () => {
      await request(server()).get('/api/vendor/products').set(auth(customer.token)).expect(403);
    });

    it('blocks anonymous access (401)', async () => {
      await request(server()).get('/api/vendor/products').expect(401);
    });
  });

  describe('shop profile', () => {
    it('returns the vendor profile with approved=false', async () => {
      const res = await request(server())
        .get('/api/vendor/profile')
        .set(auth(vendorA.token))
        .expect(200);
      expect(res.body.approved).toBe(false);
      expect(res.body.deliveryRadiusKm).toBe(5);
    });

    it('updates the delivery radius', async () => {
      const res = await request(server())
        .patch('/api/vendor/profile')
        .set(auth(vendorA.token))
        .send({ deliveryRadiusKm: 12.5, deliveryFee: 60 })
        .expect(200);
      expect(res.body.deliveryRadiusKm).toBe(12.5);
      expect(res.body.deliveryFee).toBe('60');
    });

    it('rejects an out-of-range radius (400)', async () => {
      await request(server())
        .patch('/api/vendor/profile')
        .set(auth(vendorA.token))
        .send({ deliveryRadiusKm: 500 })
        .expect(400);
    });

    it('keeps the PostGIS point in sync when coordinates move', async () => {
      await request(server())
        .patch('/api/vendor/profile')
        .set(auth(vendorA.token))
        .send({ latitude: 13.0358, longitude: 77.597 })
        .expect(200);

      const [row] = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM vendors WHERE name = ${'Isolation Shop A ' + stamp}
      `;
      expect(row.lat).toBeCloseTo(13.0358, 4);
      expect(row.lng).toBeCloseTo(77.597, 4);
    });
  });

  describe('deletion', () => {
    it('deletes your own product', async () => {
      const res = await request(server())
        .delete(`/api/vendor/products/${productA}`)
        .set(auth(vendorA.token))
        .expect(200);
      expect(res.body.deleted).toBe(true);
      expect(await prisma.product.count({ where: { id: productA } })).toBe(0);
    });
  });
});
