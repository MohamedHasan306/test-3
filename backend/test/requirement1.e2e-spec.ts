import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { Role } from '../src/common/enums/role.enum.js';
import { User } from '../src/users/entities/user.entity.js';

/**
 * End-to-end coverage for Requirement 1 — API Design & Security.
 * Runs against a real Postgres database (see package.json "test:e2e").
 *
 * Each top-level block boots its own Nest application (mirroring main.ts
 * exactly, including the real ThrottlerGuard) so the in-memory rate-limit
 * counter it keeps never carries over between blocks, and the login
 * throttle suite at the bottom is the only place that intentionally trips it.
 */

async function bootstrapApp(): Promise<INestApplication<App>> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder().setTitle('E-Commerce Platform API').setVersion('1.0').build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.init();
  return app;
}

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function assertErrorShape(body: any, statusCode: number) {
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(body.error.statusCode).toBe(statusCode);
  expect(typeof body.error.code).toBe('string');
  expect(body.error.message).toBeDefined();
  expect(typeof body.error.path).toBe('string');
  expect(typeof body.error.timestamp).toBe('string');
  expect(Number.isNaN(Date.parse(body.error.timestamp))).toBe(false);
}

// ===========================================================================
// Platform basics: health, docs, versioning, unified error shape
// ===========================================================================

describe('platform basics', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200', async () => {
    await request(server).get('/api/v1/health').expect(200);
  });

  it('GET /api/docs serves the interactive Swagger UI', async () => {
    const res = await request(server).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('rejects an un-versioned path (versioning must live in the URL)', async () => {
    await request(server).get('/api/products').expect(404);
  });

  it('every error response follows the documented unified shape', async () => {
    const res = await request(server).get(`/api/v1/products/${randomUUID()}`);
    assertErrorShape(res.body, 404);
  });
});

// ===========================================================================
// Auth — register / login / me
// ===========================================================================

describe('Auth', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(prefix = 'user') {
    const email = `${unique(prefix)}@example.com`;
    const password = 'Str0ngPassword!';
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email, password });
    return { email, password, token: res.body.accessToken as string, id: res.body.user?.id as string, res };
  }

  describe('POST /api/v1/auth/register', () => {
    it('creates an account as a customer by default and returns a token', async () => {
      const { res } = await registerUser();
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.role).toBe('customer');
    });

    it('rejects a duplicate email with 409', async () => {
      const { email, password } = await registerUser();
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({ name: 'Other Name', email, password });
      expect(res.status).toBe(409);
      assertErrorShape(res.body, 409);
    });

    it('rejects an invalid email with 400', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({ name: 'Test', email: 'not-an-email', password: 'Str0ngPassword!' });
      expect(res.status).toBe(400);
      assertErrorShape(res.body, 400);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({ name: 'Test', email: `${unique('short')}@example.com`, password: '123' });
      expect(res.status).toBe(400);
    });

    it('rejects unexpected fields in the body (whitelist enforced)', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test',
          email: `${unique('extra')}@example.com`,
          password: 'Str0ngPassword!',
          role: 'admin', // a client must never be able to self-promote
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const { email, password } = await registerUser();
      const res = await request(server).post('/api/v1/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with 401 and a generic message', async () => {
      const { email } = await registerUser();
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword!' });
      expect(res.status).toBe(401);
      assertErrorShape(res.body, 401);
    });

    it('rejects an email that does not exist with the same generic 401', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('returns the current profile when authenticated', async () => {
      const { token, email } = await registerUser();
      const res = await request(server).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(email);
    });

    it('rejects a request with no token at all (401)', async () => {
      const res = await request(server).get('/api/v1/users/me');
      expect(res.status).toBe(401);
      assertErrorShape(res.body, 401);
    });

    it('rejects a garbage/invalid token (401)', async () => {
      const res = await request(server).get('/api/v1/users/me').set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });
  });
});

// ===========================================================================
// Products
// ===========================================================================

describe('Products', () => {
  let app: INestApplication<App>;
  let server: App;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
    usersRepository = app.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(prefix = 'user') {
    const email = `${unique(prefix)}@example.com`;
    const password = 'Str0ngPassword!';
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email, password });
    return { email, password, token: res.body.accessToken as string, id: res.body.user?.id as string };
  }

  async function makeAdmin(userId: string, email: string, password: string) {
    await usersRepository.update({ id: userId }, { role: Role.ADMIN });
    const res = await request(server).post('/api/v1/auth/login').send({ email, password });
    return res.body.accessToken as string;
  }

  async function createProduct(
    adminToken: string,
    overrides: Partial<{ name: string; category: string; price: string }> = {},
  ) {
    return request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', overrides.name ?? unique('Product'))
      .field('description', 'A product used in tests')
      .field('price', overrides.price ?? '19.99')
      .field('category', overrides.category ?? unique('category'));
  }

  it('GET /api/v1/products is public and paginated', async () => {
    const { id, email, password } = await registerUser('admin-src');
    const adminToken = await makeAdmin(id, email, password);
    const category = unique('paginated-cat');
    for (let i = 0; i < 3; i++) {
      const res = await createProduct(adminToken, { category });
      expect(res.status).toBe(201);
    }

    const page1 = await request(server).get('/api/v1/products').query({ category, limit: 2, page: 1 });
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.totalPages).toBe(2);

    const page2 = await request(server).get('/api/v1/products').query({ category, limit: 2, page: 2 });
    expect(page2.body.items).toHaveLength(1);
  });

  it('GET /api/v1/products/:id 404s for a non-existent product', async () => {
    const res = await request(server).get(`/api/v1/products/${randomUUID()}`);
    expect(res.status).toBe(404);
    assertErrorShape(res.body, 404);
  });

  it('GET /api/v1/products/:id 400s for a malformed id', async () => {
    await request(server).get('/api/v1/products/not-a-uuid').expect(400);
  });

  it('rejects product creation with no token (401)', async () => {
    const res = await request(server)
      .post('/api/v1/products')
      .field('name', 'X')
      .field('price', '1.00')
      .field('category', 'x');
    expect(res.status).toBe(401);
  });

  it('rejects product creation by a customer (403)', async () => {
    const { token } = await registerUser();
    const res = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'X')
      .field('price', '1.00')
      .field('category', 'x');
    expect(res.status).toBe(403);
    assertErrorShape(res.body, 403);
  });

  it('lets an admin create a product, with and without an image', async () => {
    const { id, email, password } = await registerUser('admin2');
    const adminToken = await makeAdmin(id, email, password);

    const withoutImage = await createProduct(adminToken);
    expect(withoutImage.status).toBe(201);
    expect(withoutImage.body.imageUrl).toBeNull();

    const withImage = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', unique('Product'))
      .field('price', '9.99')
      .field('category', unique('category'))
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'photo.png', contentType: 'image/png' });
    expect(withImage.status).toBe(201);
    expect(withImage.body.imageUrl).toMatch(/^\/uploads\/products\//);

    const served = await request(server).get(withImage.body.imageUrl);
    expect(served.status).toBe(200);
  });

  it('rejects a non-numeric price with 400', async () => {
    const { id, email, password } = await registerUser('admin3');
    const adminToken = await makeAdmin(id, email, password);
    const res = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'X')
      .field('price', 'not-a-number')
      .field('category', 'x');
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Orders — the core security scenario required by the interview
// ===========================================================================

describe('Orders', () => {
  let app: INestApplication<App>;
  let server: App;
  let usersRepository: Repository<User>;
  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
    usersRepository = app.get(getRepositoryToken(User));

    const email = `${unique('orders-admin')}@example.com`;
    const password = 'Str0ngPassword!';
    const registerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Orders Admin', email, password });
    await usersRepository.update({ id: registerRes.body.user.id }, { role: Role.ADMIN });
    const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password });
    adminToken = loginRes.body.accessToken;

    const productRes = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Shared Test Product')
      .field('description', 'Used across the Orders suite')
      .field('price', '10.00')
      .field('category', 'orders-test');
    productId = productRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(prefix: string) {
    const email = `${unique(prefix)}@example.com`;
    const password = 'Str0ngPassword!';
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email, password });
    return { email, password, token: res.body.accessToken as string, id: res.body.user?.id as string };
  }

  it('rejects order creation with no token (401)', async () => {
    const res = await request(server).post('/api/v1/orders').send({ items: [] });
    expect(res.status).toBe(401);
  });

  it('creates an order with a correct computed total', async () => {
    const userA = await registerUser('userA');
    const res = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId, quantity: 3 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.totalPrice).toBe('30.00');
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects an order with a quantity below 1', async () => {
    const userA = await registerUser('userA');
    const res = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId, quantity: 0 }] });
    expect(res.status).toBe(400);
  });

  it('rejects an order with an empty item list', async () => {
    const userA = await registerUser('userA');
    const res = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('rejects an order referencing a product that does not exist', async () => {
    const userA = await registerUser('userA');
    const res = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId: randomUUID(), quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('the required security scenario: owner sees it, another customer cannot, no token cannot, admin can', async () => {
    const userA = await registerUser('userA');
    const userB = await registerUser('userB');

    const created = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId, quantity: 1 }] });
    const orderId = created.body.id as string;

    // A can see their own order
    const asOwner = await request(server).get(`/api/v1/orders/${orderId}`).set('Authorization', `Bearer ${userA.token}`);
    expect(asOwner.status).toBe(200);

    // B cannot see A's order
    const asOther = await request(server).get(`/api/v1/orders/${orderId}`).set('Authorization', `Bearer ${userB.token}`);
    expect(asOther.status).toBe(403);
    assertErrorShape(asOther.body, 403);

    // No token at all
    const noToken = await request(server).get(`/api/v1/orders/${orderId}`);
    expect(noToken.status).toBe(401);
    assertErrorShape(noToken.body, 401);

    // Admin can see any order
    const asAdmin = await request(server).get(`/api/v1/orders/${orderId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);

    // B (a customer) cannot change order status
    const statusByCustomer = await request(server)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ status: 'shipped' });
    expect(statusByCustomer.status).toBe(403);
    assertErrorShape(statusByCustomer.body, 403);

    // Only an admin can change order status
    const statusByAdmin = await request(server)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped' });
    expect(statusByAdmin.status).toBe(200);
    expect(statusByAdmin.body.status).toBe('shipped');
  });

  it('rejects an invalid order status value', async () => {
    const userA = await registerUser('userA');
    const created = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId, quantity: 1 }] });

    const res = await request(server)
      .patch(`/api/v1/orders/${created.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'not-a-real-status' });
    expect(res.status).toBe(400);
  });

  it('404s when changing the status of a non-existent order', async () => {
    const res = await request(server)
      .patch(`/api/v1/orders/${randomUUID()}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped' });
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/orders only returns the caller’s own orders, but all of them for an admin', async () => {
    const userA = await registerUser('userA');
    const userB = await registerUser('userB');

    await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ items: [{ productId, quantity: 1 }] });
    await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ items: [{ productId, quantity: 1 }] });

    const asA = await request(server).get('/api/v1/orders').set('Authorization', `Bearer ${userA.token}`);
    expect(asA.body.every((o: any) => o.userId === userA.id)).toBe(true);

    const asAdmin = await request(server).get('/api/v1/orders').set('Authorization', `Bearer ${adminToken}`);
    const userIds = new Set(asAdmin.body.map((o: any) => o.userId));
    expect(userIds.has(userA.id)).toBe(true);
    expect(userIds.has(userB.id)).toBe(true);
  });
});

// ===========================================================================
// Notifications
// ===========================================================================

describe('Notifications', () => {
  let app: INestApplication<App>;
  let server: App;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
    usersRepository = app.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request (401)', async () => {
    await request(server).get('/api/v1/notifications').expect(401);
  });

  it('notifies the order owner on creation and on status change, and keeps users isolated', async () => {
    const adminEmail = `${unique('notif-admin')}@example.com`;
    const password = 'Str0ngPassword!';
    const adminRegister = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Notif Admin', email: adminEmail, password });
    await usersRepository.update({ id: adminRegister.body.user.id }, { role: Role.ADMIN });
    const adminLogin = await request(server).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const adminToken = adminLogin.body.accessToken;

    const product = await request(server)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Notif Product')
      .field('price', '5.00')
      .field('category', 'notif-test');

    const userA = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'User A', email: `${unique('notifA')}@example.com`, password });
    const userB = await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'User B', email: `${unique('notifB')}@example.com`, password });

    const order = await request(server)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userA.body.accessToken}`)
      .send({ items: [{ productId: product.body.id, quantity: 1 }] });

    await request(server)
      .patch(`/api/v1/orders/${order.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'confirmed' });

    const notificationsA = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userA.body.accessToken}`);
    expect(notificationsA.body.length).toBeGreaterThanOrEqual(2);
    expect(notificationsA.body.some((n: any) => n.message.includes(order.body.id))).toBe(true);

    const notificationsB = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userB.body.accessToken}`);
    expect(notificationsB.body.some((n: any) => n.message.includes(order.body.id))).toBe(false);
  });
});

// ===========================================================================
// Login rate limiting — a fresh app so no earlier request counts against it.
// ===========================================================================

describe('Login rate limiting', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    app = await bootstrapApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks login after 5 attempts within a minute, per the documented limit', async () => {
    const email = `${unique('throttle')}@example.com`;
    await request(server)
      .post('/api/v1/auth/register')
      .send({ name: 'Throttle Test', email, password: 'Str0ngPassword!' });

    const attempts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword!' });
      attempts.push(res.status);
    }

    expect(attempts.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(attempts[5]).toBe(429);
  });
});
