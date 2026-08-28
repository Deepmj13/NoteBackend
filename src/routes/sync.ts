import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Field helpers (all timestamps travel as ISO-8601 strings, same as the app)
// ---------------------------------------------------------------------------

function noteColumns() {
  return `id, user_id, title, content, created_at, updated_at,
          is_deleted, version, is_favorite, is_pinned, note_type, folder_id`;
}

function folderColumns() {
  return `id, user_id, name, parent_folder_id, created_at, updated_at, is_deleted`;
}

// ---------------------------------------------------------------------------
// Pull: rows updated after `since` (ISO string)
// ---------------------------------------------------------------------------

router.get('/notes', requireAuth, asyncHandler(async (req, res) => {
  const auth = req as AuthenticatedRequest;
  const since = z.string().optional().parse(req.query.since) ?? '1970-01-01T00:00:00.000Z';
  const { rows } = await pool.query(
    `select ${noteColumns()} from notes
     where user_id = $1 and updated_at > $2
     order by updated_at asc`,
[auth.userId, since],
  );
  res.json(rows);
}));

router.get('/folders', requireAuth, asyncHandler(async (req, res) => {
  const auth = req as AuthenticatedRequest;
  const since = z.string().optional().parse(req.query.since) ?? '1970-01-01T00:00:00.000Z';
  const { rows } = await pool.query(
    `select ${folderColumns()} from folders
     where user_id = $1 and updated_at > $2
     order by updated_at asc`,
[auth.userId, since],
  );
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// Push: batch upsert. user_id is always taken from the JWT.
//
// Conflicts are resolved last-write-wins with a saturation guard: a stale
// row (lower version, or equal version with an older updated_at) is rejected
// instead of clobbering newer data. Each item is reported as applied or
// rejected so the client only clears its dirty flag for accepted writes.
// ---------------------------------------------------------------------------

const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(''),
  content: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string(),
  is_deleted: z.boolean().default(false),
  version: z.number().int().default(1),
  is_favorite: z.boolean().default(false),
  is_pinned: z.boolean().default(false),
  note_type: z.string().default('text'),
  folder_id: z.string().nullable().optional(),
});

router.post('/notes', requireAuth, asyncHandler(async (req, res) => {
  const auth = req as AuthenticatedRequest;
  const items = z.array(noteSchema).parse(req.body ?? []);
  if (items.length === 0) {
    res.json({ count: 0, applied: [], rejected: [] });
    return;
  }
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('begin');
    for (const n of items) {
      const { rows } = await client.query<{ id: string }>(
        `insert into notes
           (id, user_id, title, content, created_at, updated_at,
            is_deleted, version, is_favorite, is_pinned, note_type, folder_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (id) do update set
           title = excluded.title,
           content = excluded.content,
           updated_at = excluded.updated_at,
           is_deleted = excluded.is_deleted,
           version = excluded.version,
           is_favorite = excluded.is_favorite,
           is_pinned = excluded.is_pinned,
           note_type = excluded.note_type,
           folder_id = excluded.folder_id
         where notes.version < excluded.version
            or (notes.version = excluded.version
                and notes.updated_at <= excluded.updated_at)
         returning id`,
        [
          n.id,
          auth.userId,
          n.title,
          n.content,
          n.created_at,
          n.updated_at,
          n.is_deleted,
          n.version,
          n.is_favorite,
          n.is_pinned,
          n.note_type,
          n.folder_id ?? null,
        ],
      );
      for (const row of rows) applied.push(row.id);
    }
    await client.query('commit');
    const appliedSet = new Set(applied);
    const rejected = items.filter((i) => !appliedSet.has(i.id)).map((i) => i.id);
    res.json({ count: applied.length, applied, rejected });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  parent_folder_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  is_deleted: z.boolean().default(false),
});

router.post('/folders', requireAuth, asyncHandler(async (req, res) => {
  const auth = req as AuthenticatedRequest;
  const items = z.array(folderSchema).parse(req.body ?? []);
  if (items.length === 0) {
    res.json({ count: 0, applied: [], rejected: [] });
    return;
  }
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('begin');
    for (const f of items) {
      const { rows } = await client.query<{ id: string }>(
        `insert into folders
           (id, user_id, name, parent_folder_id, created_at, updated_at, is_deleted)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (id) do update set
           name = excluded.name,
           parent_folder_id = excluded.parent_folder_id,
           updated_at = excluded.updated_at,
           is_deleted = excluded.is_deleted
         where folders.updated_at <= excluded.updated_at
         returning id`,
        [
          f.id,
          auth.userId,
          f.name,
          f.parent_folder_id ?? null,
          f.created_at,
          f.updated_at,
          f.is_deleted,
        ],
      );
      for (const row of rows) applied.push(row.id);
    }
    await client.query('commit');
    const appliedSet = new Set(applied);
    const rejected = items.filter((i) => !appliedSet.has(i.id)).map((i) => i.id);
    res.json({ count: applied.length, applied, rejected });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
