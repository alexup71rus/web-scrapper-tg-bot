import initSqlJs from 'sql.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from 'sql.js';

export async function initDb(): Promise<Database> {
  const SQL = await initSqlJs();
  let db: Database;

  try {
    const fileBuffer = await fs.readFile('./tasks.db');
    db = new SQL.Database(fileBuffer);
    console.log('Loaded existing database from tasks.db');
  } catch (err) {
    db = new SQL.Database();
    console.log('Created new in-memory database');
  }

  const migrationsDir = path.resolve('./migrations');
  try {
    await fs.mkdir(migrationsDir, { recursive: true });
  } catch (err) {
    console.error('❌ Error creating migrations directory:', err);
    throw err;
  }

  try {
    const migrationFiles = await fs.readdir(migrationsDir).catch(() => []);
    const tsFiles = migrationFiles.filter(file => file.endsWith('.ts')).sort();

    if (tsFiles.length === 0) {
      console.warn('⚠️ No migration files found in migrations directory');
    }

    for (const file of tsFiles) {
      try {
        const migrationPath = path.join(migrationsDir, file);
        const { up } = await import(migrationPath);
        console.log(`Applying migration: ${file}`);
        await up(db);
        console.log(`Migration ${file} applied successfully`);
      } catch (err) {
        console.error(`❌ Error applying migration ${file}:`, err);
        throw err;
      }
    }
  } catch (err) {
    console.error('❌ Error applying migrations:', err);
    throw err;
  }

  return db;
}

export async function runMigrations() {
  const db = await initDb();
  console.log('Migrations applied successfully');
  const data = db.export();
  await fs.writeFile('./tasks.db', Buffer.from(data));
  return db;
}

if (require.main === module) {
  runMigrations().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}