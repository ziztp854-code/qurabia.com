import { Client } from 'pg';

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'tahaddi',
});

await client.connect();
const before = await client.query(
  'SELECT id, email, name, role, status FROM "User" WHERE email = $1',
  ['keemoo4u@hotmail.com'],
);
console.log('BEFORE:', before.rows);

const upd = await client.query(
  'UPDATE "User" SET role = $1::"UserRole", "updatedAt" = NOW() WHERE email = $2 RETURNING id, email, name, role, status',
  ['ADMIN', 'keemoo4u@hotmail.com'],
);
console.log('AFTER :', upd.rows);
await client.end();
