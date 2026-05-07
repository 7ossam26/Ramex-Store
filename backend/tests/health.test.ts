import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRouter } from '../src/api/health.js';

describe('GET /health', () => {
  it('responds with 200 when DB is reachable, or 503 if not — never 500', async () => {
    const app = express().use('/health', healthRouter);
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('ok');
  });
});
