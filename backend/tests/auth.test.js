import request from 'supertest';
import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';

const mockUserModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn()
};

jest.unstable_mockModule('../src/models/User.js', () => ({
  default: mockUserModel
}));

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const passwordHash = await bcrypt.hash('Test@12345', 4);

const user = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test User',
  email: 'test@example.com',
  password: passwordHash,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

const selectResult = (value) => ({ select: jest.fn().mockResolvedValue(value) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('health endpoint', () => {
  test('returns HTTP 200', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('authentication endpoints', () => {
  test('registers a valid user', async () => {
    mockUserModel.findOne.mockResolvedValueOnce(null);
    mockUserModel.create.mockResolvedValueOnce(user);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Test@12345' });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.password).toBeUndefined();
  });

  test('rejects duplicate registration', async () => {
    mockUserModel.findOne.mockResolvedValueOnce(user);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Another User', email: 'test@example.com', password: 'Test@12345' });

    expect(response.status).toBe(409);
  });

  test('logs in with valid credentials', async () => {
    mockUserModel.findOne.mockReturnValueOnce(selectResult(user));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@12345' });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  test('rejects an invalid password', async () => {
    mockUserModel.findOne.mockReturnValueOnce(selectResult(user));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  test('rejects a missing token for /api/auth/me', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
  });

  test('rejects an invalid token for /api/auth/me', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });
});
