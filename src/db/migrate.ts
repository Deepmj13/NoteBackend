import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');

    // Track what has been applied so schema.sql only runs once.
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query(
      `select name from schema_migrations where name = 'initial'`,
    );
    if (rows.length === 0) {
      // Drain any legacy tables from an earlier/foreign schema so the fresh
      // schema below can be applied cleanly. Only runs on the initial
      // migration (approved: existing data is intentionally discarded).
      await client.query(`
        drop table if exists devices cascade;
        drop table if exists processed_operations cascade;
        drop table if exists refresh_tokens cascade;
        drop table if exists sync_changes cascade;
        drop table if exists notes cascade;
        drop table if exists folders cascade;
        drop table if exists users cascade;
      `);
      await client.query(sql);
      await client.query(
        `insert into schema_migrations (name) values ('initial')`,
      );
      console.log('Applied initial schema.');
    } else {
      console.log('Initial schema already applied; nothing to do.');
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
