-- GitHub source files are never acceptance proof, including direct database writes.
ALTER TABLE public.platform_evidence
ADD CONSTRAINT platform_evidence_github_not_accepted
CHECK (source <> 'github' OR (accepted = false AND verdict IS NULL));
-- Only a canonical GitHub HTTPS blob URL is allowed as a source-code pointer.
ALTER TABLE public.platform_evidence
ADD CONSTRAINT platform_evidence_code_url_source
CHECK (code_url IS NULL OR (source = 'github' AND code_url LIKE 'https://github.com/%/blob/%'));
