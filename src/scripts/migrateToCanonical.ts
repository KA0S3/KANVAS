/**
 * Phase 11: Migration from Old Data to Canonical Document Format
 * 
 * This script migrates existing projects.description JSON to world_document.
 * 
 * BEFORE RUNNING:
 * 1. Backup your database - this modifies all projects
 * 2. Run this on staging first with production data dump
 * 3. Have a rollback plan ready (keep old data until verified)
 * 
 * USAGE:
 * - Dev: npx tsx src/scripts/migrateToCanonical.ts
 * - Or: npm run migrate (add to package.json scripts)
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing Supabase credentials');
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

// Create admin client (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface OldProjectData {
  assets?: Record<string, any>;
  tags?: Record<string, any>;
  globalCustomFields?: any[];
  backgrounds?: Record<string, any>;
  viewport?: {
    offset?: { x: number; y: number };
    scale?: number;
    currentAssetId?: string | null;
  };
}

interface MigrationResult {
  migrated: number;
  failed: number;
  skipped: number;
  errors: Array<{ projectId: string; name: string; error: string }>;
}

/**
 * Parse old description field JSON with error handling
 */
function parseOldData(description: string | null): { data: OldProjectData | null; error: string | null } {
  if (!description) {
    return { data: null, error: null };
  }

  try {
    const parsed = JSON.parse(description);
    return { data: parsed, error: null };
  } catch (e) {
    // Try to handle common corruption issues
    try {
      // Remove trailing commas
      const cleaned = description.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(cleaned);
      console.warn('  ⚠ Fixed trailing commas in JSON');
      return { data: parsed, error: null };
    } catch {
      try {
        // Try to extract valid JSON subset
        const match = description.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          console.warn('  ⚠ Extracted partial JSON');
          return { data: parsed, error: null };
        }
      } catch {}
    }

    return { 
      data: null, 
      error: e instanceof Error ? e.message : 'Invalid JSON' 
    };
  }
}

/**
 * Convert old format to new canonical world document format
 */
function convertToWorldDocument(oldData: OldProjectData | null): {
  worldDocument: Record<string, any>;
  version: number;
} {
  const defaultViewport = {
    offset: { x: 0, y: 0 },
    scale: 1,
    currentAssetId: null
  };

  if (!oldData) {
    return {
      worldDocument: {
        assets: {},
        tags: {},
        globalCustomFields: [],
        backgrounds: {},
        viewport: defaultViewport,
        version: 1
      },
      version: 1
    };
  }

  return {
    worldDocument: {
      assets: oldData.assets || {},
      tags: oldData.tags || {},
      globalCustomFields: oldData.globalCustomFields || [],
      backgrounds: oldData.backgrounds || {},
      viewport: oldData.viewport || defaultViewport,
      version: 1
    },
    version: 1
  };
}

/**
 * Migrate a single project
 */
async function migrateProject(project: any): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Parse old format
    const { data: oldData, error: parseError } = parseOldData(project.description);
    
    if (parseError) {
      return { success: false, error: `Parse error: ${parseError}` };
    }

    // 2. Convert to new format
    const { worldDocument, version } = convertToWorldDocument(oldData);

    // 3. Update project with world_document
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        world_document: worldDocument,
        version: version,
        // Keep description for rollback safety - clear it later
        // description: null  
      })
      .eq('id', project.id);

    if (updateError) {
      return { success: false, error: `Update error: ${updateError.message}` };
    }

    // 4. Build initial index using RPC
    // Note: Phase 6+ version returns { assets_rebuilt, duration_ms }
    const { data: indexData, error: indexError } = await supabase.rpc('rebuild_project_index', {
      p_project_id: project.id
    });

    if (indexError) {
      // Index failure is not critical - can be rebuilt later
      console.warn(`  ⚠ Index rebuild failed for ${project.name}: ${indexError.message}`);
    } else if (indexData && indexData.length > 0) {
      console.log(`  (indexed ${indexData[0].assets_rebuilt} assets in ${indexData[0].duration_ms}ms)`);
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Main migration function
 */
async function migrateToCanonical(): Promise<MigrationResult> {
  console.log('='.repeat(60));
  console.log('Phase 11: Migration to Canonical Document Format');
  console.log('='.repeat(60));
  console.log();

  const result: MigrationResult = {
    migrated: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // 1. Fetch all projects with old format (description contains data)
    console.log('Fetching projects with legacy data...');
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, description, user_id, world_document')
      .not('description', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch projects: ${error.message}`);
    }

    const totalProjects = projects?.length || 0;
    console.log(`Found ${totalProjects} projects with description data`);
    console.log();

    if (totalProjects === 0) {
      console.log('No projects need migration.');
      return result;
    }

    // 2. Process each project
    console.log('Starting migration...');
    console.log('-'.repeat(60));

    for (let i = 0; i < totalProjects; i++) {
      const project = projects[i];
      const progress = `[${i + 1}/${totalProjects}]`;

      // Skip if already has world_document (idempotent)
      if (project.world_document && Object.keys(project.world_document).length > 0) {
        console.log(`${progress} ⏭ Skipped (already migrated): ${project.name}`);
        result.skipped++;
        continue;
      }

      process.stdout.write(`${progress} Migrating: ${project.name}... `);

      const { success, error } = await migrateProject(project);

      if (success) {
        console.log('✓ Done');
        result.migrated++;
      } else {
        console.log(`✗ Failed: ${error}`);
        result.failed++;
        result.errors.push({
          projectId: project.id,
          name: project.name,
          error: error || 'Unknown error'
        });
      }
    }

    console.log('-'.repeat(60));
    console.log();

  } catch (error) {
    console.error('Fatal error during migration:', error);
    throw error;
  }

  return result;
}

/**
 * Run migration with summary
 */
async function runMigration() {
  const startTime = Date.now();

  try {
    const result = await migrateToCanonical();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('='.repeat(60));
    console.log('Migration Complete');
    console.log('='.repeat(60));
    console.log(`  Duration: ${duration}s`);
    console.log(`  Migrated: ${result.migrated}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Failed: ${result.failed}`);
    console.log();

    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(({ projectId, name, error }) => {
        console.log(`  - ${name} (${projectId}): ${error}`);
      });
      console.log();
    }

    // Summary
    if (result.failed === 0) {
      console.log('✓ All projects migrated successfully!');
      console.log();
      console.log('Next steps:');
      console.log('  1. Verify data integrity with verification queries');
      console.log('  2. Test a few projects in the UI');
      console.log('  3. Once verified, clear old description fields:');
      console.log('     UPDATE projects SET description = NULL WHERE world_document IS NOT NULL;');
      process.exit(0);
    } else {
      console.log('⚠ Some migrations failed. Review errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main || require.main === module) {
  runMigration();
}

export { migrateToCanonical, parseOldData, convertToWorldDocument };
export default migrateToCanonical;
