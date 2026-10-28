-- Append-only, per-user reasoning observations, shared by the application and MCP.
-- Saves bounded summaries, never entire ChatGPT transcripts or uploaded copyrighted problems.
CREATE TABLE IF NOT EXISTS public.learning_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 client_event_id text NOT NULL CHECK (client_event_id ~ '^[A-Za-z0-9:_-]{8,100}$'),
 item_id uuid REFERENCES public.curriculum_items(id) ON DELETE SET NULL,
 problem_ref text,
 kind text NOT NULL CHECK (kind IN ('problem_attempt','reasoning_insight','mistake','approach_comparison','transfer_attempt','recall_check')),
 summary text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 10 AND 700),
 concept_keys text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(concept_keys)<=6),
 mistake_class text,
 hint_stage text,
 confidence integer CHECK (confidence BETWEEN 1 AND 5),
 independently_explained boolean,
 origin text NOT NULL CHECK (origin IN ('chatgpt','app')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,client_event_id),
 CHECK(item_id IS NOT NULL OR problem_ref IS NOT NULL),
 CHECK(problem_ref IS NULL OR problem_ref ~ '^(lc:[0-9]{1,7}|cf:[0-9]{1,9}[A-Za-z0-9]{1,5}|manual:[a-z0-9][a-z0-9-]{2,95})$'),
 CHECK(mistake_class IS NULL OR mistake_class IN ('base-case','boundary','invariant','complexity','data-structure','implementation','pattern-selection','other')),
 CHECK(hint_stage IS NULL OR hint_stage IN ('none','gentle','deeper','solution'))
);
CREATE INDEX IF NOT EXISTS learning_events_user_recent ON public.learning_events(user_id,recorded_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_user_item ON public.learning_events(user_id,item_id,recorded_at DESC);
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.learning_events TO authenticated;
REVOKE UPDATE,DELETE ON public.learning_events FROM authenticated;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='learning_events' AND policyname='own learning events select') THEN
  CREATE POLICY "own learning events select" ON public.learning_events FOR SELECT TO authenticated USING (auth.uid()=user_id);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='learning_events' AND policyname='own learning events insert') THEN
  CREATE POLICY "own learning events insert" ON public.learning_events FOR INSERT TO authenticated WITH CHECK
   (auth.uid()=user_id AND (item_id IS NULL OR EXISTS (SELECT 1 FROM public.curriculum_items c WHERE c.id=item_id AND c.user_id=auth.uid())));
 END IF;
END $$;
