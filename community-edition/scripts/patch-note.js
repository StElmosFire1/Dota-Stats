#!/usr/bin/env node
/**
 * Usage: node scripts/patch-note.js "1.5" "Title here" "Content here"
 * Inserts a patch note directly into the DB (used during deployments).
 */
const db = require('../src/db');

const [,, version, title, content] = process.argv;
if (!version || !title || !content) {
  console.error('Usage: node scripts/patch-note.js <version> <title> <content>');
  process.exit(1);
}

(async () => {
  try {
    const note = await db.createPatchNote({ version, title, content, author: 'StElmosFire1' });
    console.log(`[PatchNote] Created: v${note.version} — ${note.title} (id=${note.id})`);
    process.exit(0);
  } catch (err) {
    console.error('[PatchNote] Error:', err.message);
    process.exit(1);
  }
})();
