/**
 * Extension Payload Migration Hooks
 * 
 * Provides migration support for extension payload version upgrades.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

/**
 * Migration hook interface
 * 
 * Migrates a payload from one version to another.
 */
export interface MigrationHook {
  /**
   * Migrate payload from one version to another
   * 
   * @param payload - Payload to migrate
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Migrated payload
   */
  migrate(payload: unknown, fromVersion: string, toVersion: string): unknown;

  /**
   * Validate payload version
   * 
   * @param payload - Payload to validate
   * @param version - Expected version
   * @returns True if payload is valid for the version
   */
  validate(payload: unknown, version: string): boolean;
}

/**
 * Migration path
 * 
 * Represents a sequence of migrations to get from one version to another.
 */
export interface MigrationPath {
  fromVersion: string;
  toVersion: string;
  migrations: MigrationHook[];
}

/**
 * Migration registry
 * 
 * Tracks available migrations for extension types.
 */
export class MigrationRegistry {
  private migrations: Map<string, Map<string, MigrationHook>>;

  constructor() {
    this.migrations = new Map();
  }

  /**
   * Register a migration hook
   * 
   * @param extensionType - Extension type (geo, legal, web)
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @param hook - Migration hook
   */
  register(
    extensionType: string,
    fromVersion: string,
    toVersion: string,
    hook: MigrationHook
  ): void {
    const key = `${fromVersion}->${toVersion}`;
    
    if (!this.migrations.has(extensionType)) {
      this.migrations.set(extensionType, new Map());
    }
    
    const typeMigrations = this.migrations.get(extensionType)!;
    typeMigrations.set(key, hook);
  }

  /**
   * Get migration path from one version to another
   * 
   * @param extensionType - Extension type
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Migration path or null if no path exists
   */
  getMigrationPath(
    extensionType: string,
    fromVersion: string,
    toVersion: string
  ): MigrationPath | null {
    if (fromVersion === toVersion) {
      return { fromVersion, toVersion, migrations: [] };
    }

    const typeMigrations = this.migrations.get(extensionType);
    if (!typeMigrations) {
      return null;
    }

    // Try direct migration first
    const directKey = `${fromVersion}->${toVersion}`;
    const directMigration = typeMigrations.get(directKey);
    if (directMigration) {
      return { fromVersion, toVersion, migrations: [directMigration] };
    }

    // Path finding (BFS) through intermediate versions
    const queue: { version: string; path: MigrationHook[] }[] = [{ version: fromVersion, path: [] }];
    const visited = new Set<string>([fromVersion]);

    while (queue.length > 0) {
      const { version: currentVersion, path } = queue.shift()!;

      // Find all possible next versions from currentVersion
      for (const [key, hook] of typeMigrations.entries()) {
        const [start, end] = key.split('->');

        if (start === currentVersion && !visited.has(end)) {
          const newPath = [...path, hook];

          if (end === toVersion) {
            return { fromVersion, toVersion, migrations: newPath };
          }

          visited.add(end);
          queue.push({ version: end, path: newPath });
        }
      }
    }

    return null;
  }

  /**
   * Check if migration exists
   * 
   * @param extensionType - Extension type
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns True if migration exists
   */
  hasMigration(
    extensionType: string,
    fromVersion: string,
    toVersion: string
  ): boolean {
    const path = this.getMigrationPath(extensionType, fromVersion, toVersion);
    return path !== null && path.migrations.length > 0;
  }
}

/**
 * Global migration registry instance
 */
export const migrationRegistry = new MigrationRegistry();
