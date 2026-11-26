-- 0005_atlassian_sources.sql — Jira and Confluence sources can be stored (BACK-99, owner approved
-- 2026-11-26). Runs as kawalys_migrator, search_path = kawalys. Nothing else changes: the BACK-53
-- mappers already produce ordinary ObservationInput rows for EvidenceRepository.ingest().
--
-- 0003 declared the provider check inline, so PostgreSQL named it sources_provider_check.
ALTER TABLE sources DROP CONSTRAINT sources_provider_check;
ALTER TABLE sources ADD CONSTRAINT sources_provider_check
  CHECK (provider IN ('github', 'jira', 'confluence'));
