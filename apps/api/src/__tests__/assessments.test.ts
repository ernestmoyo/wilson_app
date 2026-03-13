import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';

let cookie: string;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/login')
    .send({ password: 'test-password' });
  expect(res.status).toBe(200);
  cookie = res.headers['set-cookie']?.[0] || '';
});

describe('Assessment Class-Conditional Checklist', () => {
  let clientId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ legal_name: 'Test Client', site_address: '123 Test St' });
    clientId = res.body.data.id;
  });

  it('generates general-only checklist when no substance classes', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'site_inspection' });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(30);
    expect(res.body.data.items.every((i: any) => i.checklist_group === 'general')).toBe(true);
  });

  it('generates general + class_2_3 for 3.1A substances', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'site_inspection', substance_classes: '3.1A' });

    expect(res.status).toBe(201);
    const items = res.body.data.items;
    expect(items).toHaveLength(40);

    const groups = [...new Set(items.map((i: any) => i.checklist_group))];
    expect(groups).toContain('general');
    expect(groups).toContain('class_2_3');
    expect(groups).not.toContain('class_6_8');
  });

  it('generates general + class_6_8 for 6.1A substances', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'site_inspection', substance_classes: '6.1A' });

    expect(res.status).toBe(201);
    const items = res.body.data.items;
    expect(items).toHaveLength(40);

    const groups = [...new Set(items.map((i: any) => i.checklist_group))];
    expect(groups).toContain('general');
    expect(groups).toContain('class_6_8');
    expect(groups).not.toContain('class_2_3');
  });

  it('generates general + class_2_3 + class_6_8 for mixed 3.1A,6.1A', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'site_inspection', substance_classes: '3.1A,6.1A' });

    expect(res.status).toBe(201);
    const items = res.body.data.items;
    expect(items).toHaveLength(50);

    const groups = [...new Set(items.map((i: any) => i.checklist_group))];
    expect(groups).toContain('general');
    expect(groups).toContain('class_2_3');
    expect(groups).toContain('class_6_8');
  });

  it('generates handler template for certified_handler type', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'certified_handler' });

    expect(res.status).toBe(201);
    const items = res.body.data.items;
    expect(items).toHaveLength(13);
    expect(items.every((i: any) => i.checklist_group === 'handler')).toBe(true);
  });

  it('rejects invalid assessment type', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: clientId, type: 'invalid_type' });
    expect(res.status).toBe(400);
  });

  it('rejects assessment for non-existent client', async () => {
    const res = await request(app)
      .post('/api/assessments')
      .set('Cookie', cookie)
      .send({ client_id: 99999, type: 'site_inspection' });
    expect(res.status).toBe(400);
  });
});

describe('Authentication', () => {
  it('blocks unauthenticated API requests', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('allows health check without auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('accepts valid password and returns cookie', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ password: 'test-password' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('allows authenticated requests with cookie', async () => {
    const loginRes = await request(app)
      .post('/api/login')
      .send({ password: 'test-password' });
    const sessionCookie = loginRes.headers['set-cookie']?.[0] || '';

    const res = await request(app)
      .get('/api/clients')
      .set('Cookie', sessionCookie);
    expect(res.status).toBe(200);
  });
});

describe('CRUD Smoke Tests', () => {
  it('creates, reads, updates, and deletes a client', async () => {
    const createRes = await request(app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ legal_name: 'CRUD Test Client', site_address: '456 Test Ave' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    const readRes = await request(app)
      .get(`/api/clients/${id}`)
      .set('Cookie', cookie);
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.legal_name).toBe('CRUD Test Client');

    const updateRes = await request(app)
      .put(`/api/clients/${id}`)
      .set('Cookie', cookie)
      .send({ legal_name: 'Updated Client' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.legal_name).toBe('Updated Client');

    const deleteRes = await request(app)
      .delete(`/api/clients/${id}`)
      .set('Cookie', cookie);
    expect(deleteRes.status).toBe(200);
  });

  it('creates and reads inventory with enriched fields', async () => {
    const clientRes = await request(app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ legal_name: 'Inventory Test', site_address: '789 Test Rd' });
    const cId = clientRes.body.data.id;

    const createRes = await request(app)
      .post('/api/inventory')
      .set('Cookie', cookie)
      .send({
        client_id: cId,
        substance_name: 'Acetone',
        hazard_class: '3.1B',
        quantity: 100,
        unit: 'litres',
        un_number: 'UN1090',
        hsno_approval: 'HSR001375',
        substance_state: 'liquid',
        sds_expiry_date: '2025-06-15',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.un_number).toBe('UN1090');
    expect(createRes.body.data.substance_state).toBe('liquid');

    await request(app).delete(`/api/inventory/${createRes.body.data.id}`).set('Cookie', cookie);
    await request(app).delete(`/api/clients/${cId}`).set('Cookie', cookie);
  });
});
