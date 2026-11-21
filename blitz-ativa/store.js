import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), {recursive:true});
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, input TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, lease_until INTEGER DEFAULT 0,
        owner TEXT, report TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS records (
        job_id TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(job_id,key));`);
  }
  create(input) {
    const id = randomUUID(), at = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs(id,input,status,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, JSON.stringify(input), 'queued', at, at);
    return this.get(id);
  }
  claim() {
    const owner = randomUUID(), now = Date.now();
    const row = this.db.prepare(`UPDATE jobs SET status='running',owner=?,lease_until=?,updated_at=?
      WHERE id=(SELECT id FROM jobs WHERE status='queued' OR (status='running' AND lease_until < ?)
      ORDER BY created_at LIMIT 1) RETURNING *`).get(owner, now + 60000, new Date(now).toISOString(), now);
    return row && {...row, input:JSON.parse(row.input)};
  }
  heartbeat(job) {
    return this.db.prepare("UPDATE jobs SET lease_until=? WHERE id=? AND owner=? AND status='running'")
      .run(Date.now() + 60000, job.id, job.owner).changes > 0;
  }
  finish(job, records, report, error = '') {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare("SELECT id FROM jobs WHERE id=? AND owner=? AND status='running'").get(job.id, job.owner);
      if (!row) throw Error('Reserva da execução expirada.');
      const insert = this.db.prepare('INSERT OR REPLACE INTO records(job_id,key,data) VALUES (?,?,?)');
      for (const record of records) insert.run(job.id, record.key, JSON.stringify(record));
      this.db.prepare('UPDATE jobs SET status=?,report=?,error=?,updated_at=?,lease_until=0 WHERE id=?')
        .run(error ? 'failed' : 'finished', JSON.stringify(report), error, new Date().toISOString(), job.id);
      this.db.exec('COMMIT');
    } catch (err) {this.db.exec('ROLLBACK'); throw err;}
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    if (!row) return null;
    return {id:row.id, input:JSON.parse(row.input), status:row.status,
      createdAt:row.created_at, updatedAt:row.updated_at,
      report:row.report && JSON.parse(row.report), error:row.error || '',
      records:this.db.prepare('SELECT data FROM records WHERE job_id=? ORDER BY key').all(id).map(item => JSON.parse(item.data))};
  }
  countPending() {
    return this.db.prepare("SELECT count(*) AS total FROM jobs WHERE status IN ('queued','running')").get().total;
  }
  close() {this.db.close();}
}
