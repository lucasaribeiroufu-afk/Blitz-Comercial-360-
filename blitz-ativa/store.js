import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {canonicalUrl} from './config.js';

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
    if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(column => column.name === 'user_id'))
      this.db.exec("ALTER TABLE jobs ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'");
    if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(column => column.name === 'request_key'))
      this.db.exec('ALTER TABLE jobs ADD COLUMN request_key TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS job_request ON jobs(user_id,request_key) WHERE request_key IS NOT NULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS sources (
      user_id TEXT NOT NULL, url TEXT NOT NULL, label TEXT NOT NULL, keywords TEXT NOT NULL,
      PRIMARY KEY(user_id,url));
      CREATE VIRTUAL TABLE IF NOT EXISTS documents USING fts5(
        user_id UNINDEXED, url UNINDEXED, fetched_at UNINDEXED, title, body,
        tokenize='unicode61 remove_diacritics 2');`);
  }
  create(input, userId = 'local', requestKey = null) {
    const id = randomUUID(), at = new Date().toISOString();
    this.db.prepare('INSERT OR IGNORE INTO jobs(id,input,status,created_at,updated_at,user_id,request_key) VALUES (?,?,?,?,?,?,?)')
      .run(id, JSON.stringify(input), 'queued', at, at, userId, requestKey);
    const row = requestKey ? this.db.prepare('SELECT id FROM jobs WHERE user_id=? AND request_key=?').get(userId, requestKey) : {id};
    return this.get(row.id, userId);
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
  finish(job, records, report, error = '', documents = []) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare("SELECT id FROM jobs WHERE id=? AND owner=? AND status='running'").get(job.id, job.owner);
      if (!row) throw Error('Reserva da execução expirada.');
      const insert = this.db.prepare('INSERT OR REPLACE INTO records(job_id,key,data) VALUES (?,?,?)');
      for (const record of records) insert.run(job.id, record.key, JSON.stringify(record));
      for (const document of documents) {
        this.db.prepare('DELETE FROM documents WHERE user_id=? AND url=?').run(job.user_id, document.url);
        this.db.prepare('INSERT INTO documents(user_id,url,fetched_at,title,body) VALUES (?,?,?,?,?)')
          .run(job.user_id, document.url, document.fetchedAt, document.title, document.body);
      }
      this.db.prepare(`DELETE FROM documents WHERE user_id=? AND rowid NOT IN
        (SELECT rowid FROM documents WHERE user_id=? ORDER BY fetched_at DESC LIMIT 10000)`)
        .run(job.user_id, job.user_id);
      this.db.prepare('UPDATE jobs SET status=?,report=?,error=?,updated_at=?,lease_until=0 WHERE id=?')
        .run(error ? 'failed' : 'finished', JSON.stringify(report), error, new Date().toISOString(), job.id);
      this.db.exec('COMMIT');
    } catch (err) {this.db.exec('ROLLBACK'); throw err;}
  }
  get(id, userId = 'local') {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(id, userId);
    if (!row) return null;
    return {id:row.id, input:JSON.parse(row.input), status:row.status,
      createdAt:row.created_at, updatedAt:row.updated_at,
      report:row.report && JSON.parse(row.report), error:row.error || '',
      records:this.db.prepare('SELECT data FROM records WHERE job_id=? ORDER BY key').all(id).map(item => JSON.parse(item.data))};
  }
  countPending() {
    return this.db.prepare("SELECT count(*) AS total FROM jobs WHERE status IN ('queued','running')").get().total;
  }
  list(userId) {
    return this.db.prepare('SELECT id,status,created_at,updated_at,input FROM jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 30')
      .all(userId).map(row => ({id:row.id,status:row.status,createdAt:row.created_at,
        updatedAt:row.updated_at,input:JSON.parse(row.input)}));
  }
  sources(userId) {
    return this.db.prepare('SELECT url,label,keywords FROM sources WHERE user_id=? ORDER BY label LIMIT 200').all(userId);
  }
  addSource(userId, source) {
    const url = canonicalUrl(source.url);
    if (typeof source.label !== 'string' || !source.label.trim() || source.label.length > 120
      || typeof source.keywords !== 'string' || source.keywords.length > 500) throw Error('Nome ou palavras-chave da fonte inválidos.');
    const existing = this.db.prepare('SELECT url FROM sources WHERE user_id=? AND url=?').get(userId, url);
    if (!existing && this.sources(userId).length >= 200) throw Error('Limite de 200 fontes cadastradas atingido.');
    this.db.prepare('INSERT OR REPLACE INTO sources(user_id,url,label,keywords) VALUES (?,?,?,?)')
      .run(userId, url, source.label.trim(), source.keywords.trim());
    return this.sources(userId);
  }
  discover(userId, query) {
    const terms = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    if (!terms.length) return [];
    const match = terms.map(term => `"${term}"`).join(' AND ');
    const indexed = this.db.prepare(`SELECT url FROM documents WHERE documents MATCH ? AND user_id=?
      AND fetched_at >= ? ORDER BY rank LIMIT 20`).all(match, userId, new Date(Date.now() - 90 * 86400000).toISOString());
    const registered = this.sources(userId).filter(source => {
      const text = `${source.label} ${source.keywords}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return terms.every(term => text.includes(term));
    });
    return [...new Set([...indexed, ...registered].map(source => source.url))].slice(0, 20);
  }
  indexCount(userId) {return this.db.prepare('SELECT count(*) AS total FROM documents WHERE user_id=?').get(userId).total;}
  close() {this.db.close();}
}
