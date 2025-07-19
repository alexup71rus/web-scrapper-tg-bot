import initSqlJs from 'sql.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from 'sql.js';
import { Logger } from './utils/logger';

export async function initDb(): Promise<Database> {
  const context = { module: 'Migrations' };
  try {
    const SQL = await initSqlJs();
    const dbPath = path.resolve(process.cwd(), 'data.db');
    let db: Database;

    try {
      const fileBuffer = await fs.readFile(dbPath);
      db = new SQL.Database(fileBuffer);
      Logger.info(context, 'Loaded existing database from data.db');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        Logger.info(context, 'No existing database found, creating new one');
        db = new SQL.Database();
      } else {
        Logger.error(context, 'Failed to load existing database', err);
        throw new Error(`Failed to load database: ${(err as Error).message}`);
      }
    }

    return db;
  } catch (err) {
    Logger.error(context, 'Database initialization failed', err);
    throw new Error(`Database initialization failed: ${(err as Error).message}`);
  }
}

export async function runMigrations(): Promise<Database> {
  const context = { module: 'Migrations' };
  try {
    const db = await initDb();
    const isBuilt = __dirname.includes('/dist') || __dirname.includes('\\dist');
    const migrationsDir = path.resolve(isBuilt ? './dist/migrations' : './src/migrations');

    try {
      await fs.mkdir(migrationsDir, { recursive: true });
    } catch (err) {
      Logger.error(context, 'Error creating migrations directory', err);
      throw new Error(`Failed to create migrations directory: ${(err as Error).message}`);
    }

    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter(file => (isBuilt ? file.endsWith('.js') : file.endsWith('.ts')))
      .sort();

    if (migrationFiles.length === 0) {
      Logger.warn(context, 'No migration files found in migrations directory');
    }

    for (const file of migrationFiles) {
      try {
        const migrationPath = path.join(migrationsDir, file);
        const module = require(migrationPath);
        const { up } = module;
        await up(db);
        Logger.info(context, `Migration ${file} applied successfully`);
      } catch (err) {
        Logger.error(context, `Error applying migration ${file}`, err);
        throw new Error(`Failed to apply migration ${file}: ${(err as Error).message}`);
      }
    }

    const data = db.export();
    await fs.writeFile(path.resolve(process.cwd(), 'data.db'), Buffer.from(data));
    Logger.info(context, 'Database saved successfully');
    return db;
  } catch (err) {
    Logger.error(context, 'Error running migrations', err);
    throw new Error(`Migration process failed: ${(err as Error).message}`);
  }
}

if (require.main === module) {
  runMigrations().catch(err => {
    Logger.error({ module: 'Migrations' }, 'Migration process failed', err);
    process.exit(1);
  });
}
