-- Non-destructive canonical roadmap reconciliation.
-- Extra imported rows remain archived (inactive); never delete learning history.
ALTER TABLE public.curriculum_items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS curriculum_user_active_position
  ON public.curriculum_items(user_id, is_active, position);

CREATE OR REPLACE FUNCTION public.reconcile_canonical_188(p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  bad_positions integer;
  unmatched integer;
  current_count integer;
  imp uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) <> 188 THEN
    RAISE EXCEPTION 'Exactly 188 canonical entries are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_entries) entry
    WHERE coalesce(trim(entry->>'title'),'') = ''
      OR (entry->>'position') !~ '^[0-9]+$'
  ) THEN RAISE EXCEPTION 'Invalid canonical row'; END IF;
  SELECT count(*) INTO bad_positions FROM (
    SELECT (entry->>'position')::int AS pos
    FROM jsonb_array_elements(p_entries) entry
    GROUP BY (entry->>'position')::int
    HAVING count(*) <> 1
  ) duplicates;
  IF bad_positions <> 0
    OR (SELECT count(DISTINCT (entry->>'position')::int) FROM jsonb_array_elements(p_entries) entry) <> 188
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_entries) entry WHERE (entry->>'position')::int NOT BETWEEN 1 AND 188)
  THEN RAISE EXCEPTION 'Canonical positions must be unique and exactly 1..188'; END IF;

  PERFORM 1 FROM public.catalog_imports WHERE user_id=uid FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.curriculum_items WHERE user_id=uid;
  IF current_count < 188 THEN RAISE EXCEPTION 'Existing catalog has only % entries; refusing reconciliation',current_count; END IF;

  -- Validate all original positions before making any changes. No guessed positional match.
  SELECT count(*) INTO unmatched
  FROM jsonb_array_elements(p_entries) entry
  LEFT JOIN public.curriculum_items c ON c.user_id=uid AND c.position=(entry->>'position')::int
  WHERE c.id IS NULL OR
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(c.title),'^[[:space:]]*[0-9]+[.][[:space:]]*','','g'),
        '[[:space:]]+(⭐|new|[(]unmarked[)])[[:space:]]*$','','g'),
      '[^[:alnum:]]','','g')
    <>
    regexp_replace(lower(entry->>'title'),'[^[:alnum:]]','','g');

  IF unmatched > 0 THEN
    RAISE EXCEPTION '% canonical titles do not match their original position; no records changed',unmatched;
  END IF;

  INSERT INTO public.catalog_imports(user_id,source_name,expected_count,imported_count,verified)
  VALUES(uid,'Coding_Intuition_188_Canonical_Roadmap.csv',188,188,false)
  RETURNING id INTO imp;

  UPDATE public.curriculum_items c SET
    title=trim(entry->>'title'),topic=nullif(entry->>'topic',''),
    reference=nullif(entry->>'reference',''),
    idea=nullif(entry->>'idea',''),
    priority_marker=nullif(entry->>'priority_marker',''),
    leetcode_id=(entry->>'leetcode_id')::integer,
    concept_only=coalesce((entry->>'concept_only')::boolean,false),
    import_id=imp,is_active=true
  FROM jsonb_array_elements(p_entries) entry
  WHERE c.user_id=uid AND c.position=(entry->>'position')::int;

  UPDATE public.curriculum_items SET is_active=false
  WHERE user_id=uid AND position>188;

  IF (SELECT count(*) FROM public.curriculum_items WHERE user_id=uid AND is_active) <> 188 THEN
    RAISE EXCEPTION 'Unexpected active catalog size; transaction rolled back';
  END IF;
  RETURN jsonb_build_object('active',188,'archived',current_count-188,'preservedRows',current_count,'importId',imp);
END $$;

REVOKE EXECUTE ON FUNCTION public.replace_catalog(text,jsonb,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_canonical_188(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_canonical_188(jsonb) TO authenticated;
