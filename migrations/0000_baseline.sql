-- 0000_baseline.sql
--
-- No-op baseline. The live production schema was created by
-- src/db/index.js init() — not by a migration. This file exists so that
-- node-pg-migrate has a starting point and so future migration files can
-- reference "post-baseline" without ambiguity.
--
-- New schema work should land in 0001_*.sql onwards.

SELECT 1;
