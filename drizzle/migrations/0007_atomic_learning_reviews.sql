-- Atomic learning review: progress schedule and reflection log must commit together.
-- Existing user history is never rewritten or deleted by this routine.
CREATE OR REPLACE FUNCTION public.record_learning_review(
 p_item_id uuid, p_grade integer, p_mistake_class text DEFAULT NULL,
 p_hint_stage text DEFAULT 'none', p_confidence integer DEFAULT 3
) RETURNS date
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
 uid uuid := auth.uid();
 prev_ease numeric;
 prev_interval integer;
 prev_repetitions integer;
 prev_status text;
 next_ease numeric;
 next_interval integer;
 next_repetitions integer;
 next_due date;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
 IF p_grade NOT BETWEEN 0 AND 5 OR p_grade IS NULL THEN RAISE EXCEPTION 'Grade must be 0..5'; END IF;
 IF p_confidence NOT BETWEEN 1 AND 5 OR p_confidence IS NULL THEN RAISE EXCEPTION 'Confidence must be 1..5'; END IF;
 IF p_hint_stage IS NULL OR p_hint_stage NOT IN ('none','gentle','deeper','solution') THEN RAISE EXCEPTION 'Invalid hint stage'; END IF;
 IF p_mistake_class IS NOT NULL AND p_mistake_class NOT IN
 ('base-case','boundary','invariant','complexity','data-structure','implementation','pattern-selection','other')
 THEN RAISE EXCEPTION 'Invalid mistake class'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.curriculum_items WHERE id=p_item_id AND user_id=uid AND is_active=true)
 THEN RAISE EXCEPTION 'Problem not present in active curriculum' USING errcode='42501'; END IF;
 -- Serialize concurrent reviews of same item, including first-time progress rows.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_item_id::text,0));
 SELECT ease,interval_days,repetitions,status INTO prev_ease,prev_interval,prev_repetitions,prev_status
 FROM public.item_progress WHERE user_id=uid AND item_id=p_item_id FOR UPDATE;
 prev_ease := coalesce(prev_ease,2.5);
 prev_interval := coalesce(prev_interval,0);
 prev_repetitions := coalesce(prev_repetitions,0);
 IF p_grade < 3 THEN
    next_repetitions:=0;
    next_interval:=1;
 ELSE
    next_repetitions:=prev_repetitions+1;
    next_interval:=CASE WHEN next_repetitions=1 THEN 1 WHEN next_repetitions=2 THEN 6
      ELSE greatest(1,floor(prev_interval * prev_ease + 0.5)::int) END;
 END IF;
 next_ease:=greatest(1.3,round(prev_ease+0.1-(5-p_grade)*(0.08+(5-p_grade)*0.02),2));
 next_due:=current_date+next_interval;
 INSERT INTO public.item_progress(user_id,item_id,ease,interval_days,repetitions,due_date,last_reviewed_at,updated_at,status)
 VALUES(uid,p_item_id,next_ease,next_interval,next_repetitions,next_due,now(),now(),
   CASE WHEN prev_status IS NULL OR prev_status='not_started' THEN 'attempted' ELSE prev_status END)
 ON CONFLICT(user_id,item_id) DO UPDATE SET
 ease=excluded.ease, interval_days=excluded.interval_days,repetitions=excluded.repetitions,
 due_date=excluded.due_date,last_reviewed_at=excluded.last_reviewed_at,
 updated_at=excluded.updated_at,status=excluded.status;
 INSERT INTO public.review_log(user_id,item_id,grade,next_due,mistake_class,hint_stage,confidence)
 VALUES(uid,p_item_id,p_grade,next_due,p_mistake_class,p_hint_stage,p_confidence);
 RETURN next_due;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_learning_review(uuid,integer,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_learning_review(uuid,integer,text,text,integer) TO authenticated;
