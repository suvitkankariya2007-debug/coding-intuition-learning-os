-- Allow signed-in owners to acknowledge explicitly opted-in memory sends, without
-- letting the browser edit content or consent after queueing.
GRANT UPDATE (status) ON public.memory_outbox TO authenticated;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='memory_outbox' AND policyname='own outbox status update') THEN
 CREATE POLICY "own outbox status update" ON public.memory_outbox FOR UPDATE TO authenticated
 USING (auth.uid() = user_id AND consent AND status IN ('queued_not_connected','failed'))
 WITH CHECK (auth.uid() = user_id AND consent AND status IN ('sent','failed'));
 END IF;
END $$;