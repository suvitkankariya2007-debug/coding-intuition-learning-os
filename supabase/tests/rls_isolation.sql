-- Two-subject RLS isolation test. Runs as one DO block and always ends by
-- raising an exception carrying the results, so every change is rolled back.
do $$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  res text := '';
  item_a uuid; n int;
begin
  -- Subject A creates a catalog through the atomic import
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.replace_catalog('test.csv',
    '[{"position":1,"title":"Two Sum","leetcode_id":1},{"position":2,"title":"Other"}]'::jsonb, false);
  select id into item_a from public.curriculum_items where position = 1;
  insert into public.item_progress(user_id, item_id, notes) values (a, item_a, 'secret A note');
  insert into public.review_log(user_id, item_id, grade, next_due) values (a, item_a, 4, current_date + 1);
  res := res || 'A_sees_items=' || (select count(*) from public.curriculum_items) || '; ';

  begin perform public.replace_catalog('again.csv', '[{"position":1,"title":"X"}]'::jsonb, false);
    res := res || 'FAIL replace_without_confirm; ';
  exception when others then res := res || 'ok replace_without_confirm_blocked; '; end;

  begin update public.catalog_imports set verified = true;
    res := res || 'FAIL verify_partial; ';
  exception when others then res := res || 'ok verify_partial_blocked; '; end;

  begin delete from public.review_log;
    res := res || 'FAIL log_delete; ';
  exception when others then res := res || 'ok log_delete_denied; '; end;

  -- Subject B
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := res || 'B_sees_items=' || (select count(*) from public.curriculum_items) || '; ';
  res := res || 'B_sees_progress=' || (select count(*) from public.item_progress) || '; ';
  res := res || 'B_sees_logs=' || (select count(*) from public.review_log) || '; ';
  update public.item_progress set notes = 'hacked' where item_id = item_a;
  get diagnostics n = row_count; res := res || 'B_updates_A=' || n || '; ';
  delete from public.curriculum_items where id = item_a;
  get diagnostics n = row_count; res := res || 'B_deletes_A=' || n || '; ';

  begin insert into public.item_progress(user_id, item_id) values (b, item_a);
    res := res || 'FAIL cross_user_fk; ';
  exception when others then res := res || 'ok cross_user_fk_blocked; '; end;

  begin insert into public.curriculum_items(user_id, position, title) values (a, 99, 'spoof');
    res := res || 'FAIL spoof_owner; ';
  exception when others then res := res || 'ok spoof_owner_blocked; '; end;

  -- Signed-out
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform count(*) from public.item_progress;
    res := res || 'FAIL anon_read; ';
  exception when others then res := res || 'ok anon_read_denied; '; end;
  begin perform public.replace_catalog('x', '[{"position":1,"title":"x"}]'::jsonb, true);
    res := res || 'FAIL anon_import; ';
  exception when others then res := res || 'ok anon_import_denied; '; end;

  reset role;
  raise exception 'RLS_RESULTS: %', res;
end $$;
