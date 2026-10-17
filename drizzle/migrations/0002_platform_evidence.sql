CREATE TABLE IF NOT EXISTS public.platform_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  item_id uuid REFERENCES public.curriculum_items(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('leetcode','codeforces','github')),
  provenance_id text NOT NULL CHECK (length(provenance_id) BETWEEN 3 AND 200),
  verdict text,
  accepted boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, provenance_id)
);
CREATE INDEX IF NOT EXISTS platform_evidence_user_item ON public.platform_evidence(user_id, item_id);
ALTER TABLE public.platform_evidence ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.platform_evidence TO authenticated;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_evidence' AND policyname='own platform evidence select') THEN
 CREATE POLICY "own platform evidence select" ON public.platform_evidence FOR SELECT TO authenticated USING (auth.uid() = user_id);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_evidence' AND policyname='own platform evidence insert') THEN
 CREATE POLICY "own platform evidence insert" ON public.platform_evidence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (item_id IS NULL OR EXISTS (SELECT 1 FROM public.curriculum_items c WHERE c.id=item_id AND c.user_id=auth.uid())));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_evidence' AND policyname='own platform evidence update') THEN
 CREATE POLICY "own platform evidence update" ON public.platform_evidence FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND (item_id IS NULL OR EXISTS (SELECT 1 FROM public.curriculum_items c WHERE c.id=item_id AND c.user_id=auth.uid())));
 END IF;
END $$;