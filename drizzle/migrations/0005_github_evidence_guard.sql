-- Keep GitHub solution files as revision references, never verified acceptance.
-- Idempotent because Lovable Cloud may already have installed these constraints.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.platform_evidence'::regclass AND conname = 'platform_evidence_github_not_accepted') THEN
    ALTER TABLE public.platform_evidence
      ADD CONSTRAINT platform_evidence_github_not_accepted
      CHECK (source <> 'github' OR (accepted = false AND verdict IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.platform_evidence'::regclass AND conname = 'platform_evidence_code_url_source') THEN
    ALTER TABLE public.platform_evidence
      ADD CONSTRAINT platform_evidence_code_url_source
      CHECK (code_url IS NULL OR (source = 'github' AND code_url LIKE 'https://github.com/%/blob/%'));
  END IF;
END $$;
