const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_size_readable TEXT NOT NULL,
      file_type TEXT DEFAULT 'application/pdf',
      cos_key TEXT NOT NULL,
      upload_time TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS resume_parsed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL UNIQUE,
      name TEXT,
      gender TEXT,
      age TEXT,
      education TEXT,
      city TEXT,
      years_total TEXT,
      target_position TEXT,
      phone TEXT,
      email TEXT,
      work_experiences TEXT,
      source_channel TEXT,
      hr_name TEXT,
      reviewer TEXT,
      raw_text TEXT,
      parsed_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);
}

// ====== 用户操作 ======

function createUser(username, hashedPassword) {
  const id = uuidv4();
  const stmt = getDb().prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
  stmt.run(id, username, hashedPassword);
  return { id, username };
}

function findUserByUsername(username) {
  const stmt = getDb().prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

// ====== 文件操作 ======

function createFileRecord(userId, fileName, fileUrl, fileSize, fileSizeReadable, cosKey) {
  const id = uuidv4();
  const stmt = getDb().prepare(
    'INSERT INTO files (id, user_id, file_name, file_url, file_size, file_size_readable, cos_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(id, userId, fileName, fileUrl, fileSize, fileSizeReadable, cosKey);
  return getFileById(id);
}

function getFileById(id) {
  const stmt = getDb().prepare('SELECT * FROM files WHERE id = ?');
  return stmt.get(id);
}

function getFilesByUserId(userId) {
  const stmt = getDb().prepare(
    `SELECT f.*,
       rp.name, rp.gender, rp.age, rp.education, rp.city,
       rp.years_total, rp.target_position, rp.phone, rp.email,
       rp.work_experiences, rp.source_channel, rp.hr_name, rp.reviewer,
       rp.parsed_at
     FROM files f
     LEFT JOIN resume_parsed rp ON f.id = rp.file_id
     WHERE f.user_id = ?
     ORDER BY f.upload_time DESC`
  );
  const rows = stmt.all(userId);
  return rows.map((row) => {
    const r = { ...row };
    if (r.work_experiences) {
      try { r.work_experiences = JSON.parse(r.work_experiences); } catch (e) { /* ignore */ }
    }
    return r;
  });
}

function getAllFiles() {
  const stmt = getDb().prepare(
    `SELECT f.*, u.username
     FROM files f
     JOIN users u ON f.user_id = u.id
     ORDER BY f.upload_time DESC`
  );
  return stmt.all();
}

function deleteFile(id, userId) {
  const stmt = getDb().prepare('DELETE FROM files WHERE id = ? AND user_id = ?');
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

// ====== 简历解析结果操作 ======

function upsertResumeParsed(fileId, data) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM resume_parsed WHERE file_id = ?').get(fileId);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE resume_parsed SET
        name = ?, gender = ?, age = ?, education = ?, city = ?,
        years_total = ?, target_position = ?, phone = ?, email = ?,
        work_experiences = ?, source_channel = ?, hr_name = ?, reviewer = ?,
        raw_text = ?, parsed_at = datetime('now', 'localtime')
      WHERE file_id = ?
    `);
    stmt.run(
      data.name || null, data.gender || null, data.age || null,
      data.education || null, data.city || null,
      data.years_total || null, data.target_position || null,
      data.phone || null, data.email || null,
      data.work_experiences ? JSON.stringify(data.work_experiences) : null,
      data.source_channel || null, data.hr_name || null, data.reviewer || null,
      data.raw_text || null, fileId
    );
  } else {
    const stmt = db.prepare(`
      INSERT INTO resume_parsed
        (file_id, name, gender, age, education, city,
         years_total, target_position, phone, email,
         work_experiences, source_channel, hr_name, reviewer, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fileId, data.name || null, data.gender || null,
      data.age || null, data.education || null, data.city || null,
      data.years_total || null, data.target_position || null,
      data.phone || null, data.email || null,
      data.work_experiences ? JSON.stringify(data.work_experiences) : null,
      data.source_channel || null, data.hr_name || null, data.reviewer || null,
      data.raw_text || null
    );
  }
}

function getResumeParsed() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT rp.*, f.file_name, f.upload_time
    FROM resume_parsed rp
    JOIN files f ON rp.file_id = f.id
    ORDER BY rp.parsed_at DESC
  `);
  const rows = stmt.all();
  return rows.map(formatParsedRow);
}

function getResumeParsedByFileId(fileId) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM resume_parsed WHERE file_id = ?');
  const row = stmt.get(fileId);
  return row ? formatParsedRow(row) : null;
}

function deleteResumeParsed(fileId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM resume_parsed WHERE file_id = ?');
  stmt.run(fileId);
}

function updateResumeParsedField(fileId, field, value) {
  const db = getDb();
  // 白名单校验，防 SQL 注入
  const allowedFields = ['name', 'gender', 'age', 'education', 'city',
    'years_total', 'target_position', 'phone', 'email',
    'source_channel', 'hr_name', 'reviewer'];
  if (!allowedFields.includes(field)) {
    throw new Error(`不允许的字段: ${field}`);
  }

  // 确保记录存在
  const existing = db.prepare('SELECT id FROM resume_parsed WHERE file_id = ?').get(fileId);
  if (!existing) {
    db.prepare('INSERT INTO resume_parsed (file_id, ' + field + ') VALUES (?, ?)').run(fileId, value);
  } else {
    db.prepare('UPDATE resume_parsed SET ' + field + ' = ?, parsed_at = datetime(\'now\', \'localtime\') WHERE file_id = ?').run(value, fileId);
  }

  return getResumeParsedByFileId(fileId);
}

function formatParsedRow(row) {
  if (!row) return null;
  return {
    ...row,
    work_experiences: row.work_experiences ? JSON.parse(row.work_experiences) : null,
  };
}

module.exports = {
  getDb,
  createUser,
  findUserByUsername,
  createFileRecord,
  getFileById,
  getFilesByUserId,
  getAllFiles,
  deleteFile,
  upsertResumeParsed,
  getResumeParsed,
  getResumeParsedByFileId,
  deleteResumeParsed,
  updateResumeParsedField,
};
