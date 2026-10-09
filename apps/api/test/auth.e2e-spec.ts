import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end auth flow. Requires a running database (`npm run db:up` or
 * `npm run db:local`) with migrations applied.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = Date.now();
  const customer = {
    email: `e2e-customer-${unique}@eplant.test`,
    password: 'Password123!',
    name: 'E2E Customer',
  };
  const vendor = {
    email: `e2e-vendor-${unique}@eplant.test`,
    password: 'Password123!',
    name: 'E2E Vendor Owner',
    vendor: {
      name: `E2E Test Nursery ${unique}`,
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      pincode: '560001',
    },
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [customer.email, vendor.email] } } });
    await app?.close();
  });

  const server = () => app.getHttpServer();

  describe('registration', () => {
    it('registers a customer and returns tokens', async () => {
      const res = await request(server()).post('/api/auth/register').send(customer).expect(201);

      expect(res.body.user).toMatchObject({ email: customer.email, role: 'CUSTOMER' });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('rejects a duplicate email with 409', async () => {
      await request(server()).post('/api/auth/register').send(customer).expect(409);
    });

    it('rejects a weak password with 400', async () => {
      await request(server())
        .post('/api/auth/register')
        .send({ ...customer, email: `weak-${unique}@eplant.test`, password: 'abc' })
        .expect(400);
    });

    it('creates a vendor profile with approved=false', async () => {
      const res = await request(server())
        .post('/api/auth/register/vendor')
        .send(vendor)
        .expect(201);

      expect(res.body.user.role).toBe('VENDOR');
      expect(res.body.user.vendor).toMatchObject({ approved: false });
      expect(res.body.user.vendor.slug).toContain('e2e-test-nursery');
    });

    it('rejects a vendor registration without coordinates', async () => {
      await request(server())
        .post('/api/auth/register/vendor')
        .send({ ...vendor, email: `novendor-${unique}@eplant.test`, vendor: { name: 'No Coords' } })
        .expect(400);
    });
  });

  describe('login and session', () => {
    it('logs in with correct credentials', async () => {
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);
      expect(res.body.user.email).toBe(customer.email);
    });

    it('rejects a wrong password with 401', async () => {
      await request(server())
        .post('/api/auth/login')
        .send({ email: customer.email, password: 'WrongPassword1' })
        .expect(401);
    });

    it('returns the same 401 for an unknown email (no user enumeration)', async () => {
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: `nobody-${unique}@eplant.test`, password: 'Password123!' })
        .expect(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('GET /auth/me requires a token', async () => {
      await request(server()).get('/api/auth/me').expect(401);
    });

    it('GET /auth/me returns the profile with a token', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password });

      const res = await request(server())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(customer.email);
    });

    it('rotates refresh tokens and invalidates the old one', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password });
      const oldRefresh = login.body.refreshToken;

      const refreshed = await request(server())
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));

      // Reusing the old token must fail (rotation + reuse detection)
      await request(server())
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(401);
    });

    it('logout invalidates the refresh token', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password });

      await request(server())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      await request(server())
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('role guards', () => {
    const tokenFor = async (email: string, password: string) => {
      const res = await request(server()).post('/api/auth/login').send({ email, password });
      return res.body.accessToken as string;
    };

    it('blocks a CUSTOMER from a VENDOR-only route with 403', async () => {
      const token = await tokenFor(customer.email, customer.password);
      const res = await request(server())
        .get('/api/auth/vendor-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body.message).toContain('Requires role: VENDOR');
    });

    it('allows a VENDOR on the VENDOR-only route', async () => {
      const token = await tokenFor(vendor.email, vendor.password);
      const res = await request(server())
        .get('/api/auth/vendor-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.vendorId).toEqual(expect.any(String));
    });

    it('blocks a VENDOR from an ADMIN-only route with 403', async () => {
      const token = await tokenFor(vendor.email, vendor.password);
      await request(server())
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('allows the seeded ADMIN on the ADMIN-only route', async () => {
      const admin = await prisma.user.findUnique({ where: { email: 'admin@eplant.test' } });
      if (!admin) return; // seed not loaded — skip rather than fail
      const token = await tokenFor('admin@eplant.test', 'Password123!');
      await request(server())
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('rejects a tampered token with 401', async () => {
      const token = await tokenFor(customer.email, customer.password);
      await request(server())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token.slice(0, -2)}xx`)
        .expect(401);
    });
  });
});
