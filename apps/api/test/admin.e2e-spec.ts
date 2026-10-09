import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Step 11 end to end. Two things matter: the console is sealed off from
 * non-admins, and the moderation switches have real consequences (an
 * unapproved shop disappears from discovery, a deactivated user cannot log in).
 */
describe('Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const customer = { email: `adm.cust.${stamp}@eplant.test`, password: 'Password123!' };

  let adminToken: string;
  let adminId: string;
  let customerToken: string;
  let customerId: string;
  let vendorToken: string;
  let vendor: { id: string; slug: string; approved: boolean; suspended: boolean };

  const http = () => request(app.getHttpServer());
  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  const login = async (email: string, password = 'Password123!') => {
    const { body } = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return body.accessToken as string;
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

    await http()
      .post('/api/auth/register')
      .send({ ...customer, name: 'Admin Test Customer', phone: '+919800000131' })
      .expect(201);
    customerToken = await login(customer.email);
    customerId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: customer.email },
        select: { id: true },
      })
    ).id;

    adminToken = await login('admin@eplant.test');
    adminId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@eplant.test' },
        select: { id: true },
      })
    ).id;

    const found = await prisma.vendor.findFirstOrThrow({
      where: { approved: true, suspended: false },
      select: {
        id: true,
        slug: true,
        approved: true,
        suspended: true,
        user: { select: { email: true } },
      },
    });
    vendor = {
      id: found.id,
      slug: found.slug,
      approved: found.approved,
      suspended: found.suspended,
    };
    vendorToken = await login(found.user.email);
  });

  afterAll(async () => {
    await prisma.masterOrder.deleteMany({ where: { customer: { email: customer.email } } });
    await prisma.user.deleteMany({ where: { email: customer.email } });
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { approved: vendor.approved, suspended: vendor.suspended },
    });
    await prisma.user.update({ where: { id: adminId }, data: { isActive: true } });
    await app.close();
  });

  describe('who may open the console', () => {
    const adminRoutes = ['/api/admin/overview', '/api/admin/analytics', '/api/admin/vendors'];

    it.each(adminRoutes)('rejects anonymous access to %s', async (route) => {
      await http().get(route).expect(401);
    });

    it.each(adminRoutes)('rejects a customer on %s', async (route) => {
      await http().get(route).set(auth(customerToken)).expect(403);
    });

    it('rejects a vendor', async () => {
      await http().get('/api/admin/users').set(auth(vendorToken)).expect(403);
    });

    it('lets an admin in', async () => {
      await http().get('/api/admin/overview').set(auth(adminToken)).expect(200);
    });
  });

  describe('overview', () => {
    it('reports the shape the dashboard renders', async () => {
      const { body } = await http().get('/api/admin/overview').set(auth(adminToken)).expect(200);

      expect(body.users.total).toBeGreaterThan(0);
      expect(body.users.admins).toBeGreaterThan(0);
      expect(body.vendors.total).toBeGreaterThanOrEqual(body.vendors.approved);
      expect(body.catalogue.activeProducts).toBeGreaterThan(0);
      // Money is a fixed-point string all the way to the browser.
      expect(body.revenue).toMatch(/^\d+\.\d{2}$/);
      expect(typeof body.reviews).toBe('number');
    });
  });

  describe('analytics', () => {
    it('zero-fills the daily series so charts do not skip quiet days', async () => {
      const { body } = await http()
        .get('/api/admin/analytics?days=14')
        .set(auth(adminToken))
        .expect(200);

      expect(body.days).toBe(14);
      expect(body.daily).toHaveLength(14);
      expect(body.daily[0]).toEqual({
        day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        orders: expect.any(Number),
        revenue: expect.any(Number),
      });
    });

    it('returns the series in ascending date order', async () => {
      const { body } = await http()
        .get('/api/admin/analytics?days=7')
        .set(auth(adminToken))
        .expect(200);

      const days = body.daily.map((row: { day: string }) => row.day);
      expect(days).toEqual([...days].sort());
    });

    it('rejects a range outside the allowed window', async () => {
      await http().get('/api/admin/analytics?days=999').set(auth(adminToken)).expect(400);
      await http().get('/api/admin/analytics?days=1').set(auth(adminToken)).expect(400);
    });
  });

  describe('vendor moderation', () => {
    it('lists shops with their counts', async () => {
      const { body } = await http().get('/api/admin/vendors').set(auth(adminToken)).expect(200);

      expect(body.total).toBeGreaterThan(0);
      expect(body.items[0]).toHaveProperty('productCount');
      expect(body.items[0]).toHaveProperty('orderCount');
    });

    it('filters to shops awaiting approval', async () => {
      const { body } = await http()
        .get('/api/admin/vendors?status=pending')
        .set(auth(adminToken))
        .expect(200);

      expect(body.items.every((item: { approved: boolean }) => !item.approved)).toBe(true);
    });

    it('rejects an unknown filter', async () => {
      await http().get('/api/admin/vendors?status=weird').set(auth(adminToken)).expect(400);
    });

    it('searches by name', async () => {
      const { body } = await http()
        .get(`/api/admin/vendors?q=${encodeURIComponent(vendor.slug.split('-')[0])}`)
        .set(auth(adminToken))
        .expect(200);

      expect(body.total).toBeGreaterThan(0);
    });

    it('rejects a patch that changes nothing', async () => {
      await http()
        .patch(`/api/admin/vendors/${vendor.id}`)
        .set(auth(adminToken))
        .send({})
        .expect(400);
    });

    it('404s for a shop that does not exist', async () => {
      await http()
        .patch('/api/admin/vendors/00000000-0000-4000-8000-000000000000')
        .set(auth(adminToken))
        .send({ approved: true })
        .expect(404);
    });

    it('suspending a shop removes it from customer-facing discovery', async () => {
      await http()
        .patch(`/api/admin/vendors/${vendor.id}`)
        .set(auth(adminToken))
        .send({ suspended: true })
        .expect(200);

      await http().get(`/api/shops/${vendor.slug}`).expect(404);

      await http()
        .patch(`/api/admin/vendors/${vendor.id}`)
        .set(auth(adminToken))
        .send({ suspended: false })
        .expect(200);

      await http().get(`/api/shops/${vendor.slug}`).expect(200);
    });

    it('keeps the original approval timestamp across a re-approval', async () => {
      const { body: first } = await http()
        .patch(`/api/admin/vendors/${vendor.id}`)
        .set(auth(adminToken))
        .send({ approved: true })
        .expect(200);

      const { body: second } = await http()
        .patch(`/api/admin/vendors/${vendor.id}`)
        .set(auth(adminToken))
        .send({ approved: true })
        .expect(200);

      expect(second.approvedAt).toBe(first.approvedAt);
    });
  });

  describe('user moderation', () => {
    it('filters by role', async () => {
      const { body } = await http()
        .get('/api/admin/users?role=VENDOR')
        .set(auth(adminToken))
        .expect(200);

      expect(body.items.every((item: { role: string }) => item.role === 'VENDOR')).toBe(true);
    });

    it('never leaks password hashes', async () => {
      const { body } = await http().get('/api/admin/users').set(auth(adminToken)).expect(200);

      expect(JSON.stringify(body)).not.toContain('passwordHash');
      expect(JSON.stringify(body)).not.toContain('$2b$');
    });

    it('refuses to let an admin deactivate themselves', async () => {
      await http()
        .patch(`/api/admin/users/${adminId}`)
        .set(auth(adminToken))
        .send({ isActive: false })
        .expect(400);
    });

    it('a deactivated user can no longer log in', async () => {
      await http()
        .patch(`/api/admin/users/${customerId}`)
        .set(auth(adminToken))
        .send({ isActive: false })
        .expect(200);

      await http()
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(401);

      await http()
        .patch(`/api/admin/users/${customerId}`)
        .set(auth(adminToken))
        .send({ isActive: true })
        .expect(200);

      await http()
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);
    });
  });

  describe('CSV export', () => {
    it.each(['orders', 'vendors', 'users', 'products'])(
      'serves %s as a downloadable file',
      async (dataset) => {
        const response = await http()
          .get(`/api/admin/export/${dataset}`)
          .set(auth(adminToken))
          .expect(200);

        expect(response.headers['content-type']).toContain('text/csv');
        expect(response.headers['content-disposition']).toContain(`${dataset}-`);
        expect(response.text.startsWith('\uFEFF')).toBe(true);
        expect(response.text.split('\r\n')[0].split(',').length).toBeGreaterThan(3);
      },
    );

    it('rejects an unknown dataset instead of guessing', async () => {
      await http().get('/api/admin/export/secrets').set(auth(adminToken)).expect(400);
    });

    it('is not downloadable by a customer', async () => {
      await http().get('/api/admin/export/users').set(auth(customerToken)).expect(403);
    });
  });
});
