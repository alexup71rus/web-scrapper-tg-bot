import initSqlJs from 'sql.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from 'sql.js';
import { Logger } from './utils/logger';

// Initializes SQLite database, loading from file or creating a new one
export async function initDb(): Promise<Database> {
  try {
    const SQL = await initSqlJs();
    let db: Database;

    try {
      const fileBuffer = await fs.readFile('./tasks.db');
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      Logger.error({ module: 'Migrations' }, 'Failed to load existing database, creating new one', err);
      db = new SQL.Database();
    }

    const isBuilt = __dirname.includes('/dist') || __dirname.includes('\\dist');
    const migrationsDir = path.resolve(isBuilt ? './dist/migrations' : './src/migrations');

    try {
      await fs.mkdir(migrationsDir, { recursive: true });
    } catch (err) {
      Logger.error({ module: 'Migrations' }, 'Error creating migrations directory', err);
      throw new Error(`Failed to create migrations directory: ${(err as Error).message}`);
    }

    try {
      const migrationFiles = (await fs.readdir(migrationsDir))
        .filter(file => (isBuilt ? file.endsWith('.js') : file.endsWith('.ts')))
        .sort();

      if (migrationFiles.length === 0) {
        Logger.warn({ module: 'Migrations' }, 'No migration files found in migrations directory');
      }

      for (const file of migrationFiles) {
        try {
          const migrationPath = path.join(migrationsDir, file);
          const module = require(migrationPath);
          const { up } = module;
          await up(db);
        } catch (err) {
          Logger.error({ module: 'Migrations' }, `Error applying migration ${file}`, err);
          throw new Error(`Failed to apply migration ${file}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      Logger.error({ module: 'Migrations' }, 'Error processing migrations', err);
      throw new Error(`Failed to process migrations: ${(err as Error).message}`);
    }

    return db;
  } catch (err) {
    Logger.error({ module: 'Migrations' }, 'Database initialization failed', err);
    throw new Error(`Database initialization failed: ${(err as Error).message}`);
  }
}

// Applies migrations and saves the database to disk
export async function runMigrations(): Promise<Database> {
  try {
    const db = await initDb();
    const data = db.export();
    await fs.writeFile('./tasks.db', Buffer.from(data));
    return db;
  } catch (err) {
    Logger.error({ module: 'Migrations' }, 'Error running migrations', err);
    throw new Error(`Migration process failed: ${(err as Error).message}`);
  }
}

if (require.main === module) {
  runMigrations().catch(err => {
    Logger.error({ module: 'Migrations' }, 'Migration process failed', err);
    process.exit(1);
  });
}
