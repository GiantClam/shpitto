create or replace function shpitto_claim_next_chat_task(p_worker_id text)
returns setof shpitto_chat_tasks
language plpgsql
as $$
declare
  v_task_id uuid;
begin
  select id
    into v_task_id
  from shpitto_chat_tasks
  where status = 'queued'
    and (expires_at is null or expires_at > timezone('utc'::text, now()))
  order by created_at asc
  for update skip locked
  limit 1;

  if v_task_id is null then
    return;
  end if;

  return query
  update shpitto_chat_tasks t
     set status = 'running',
         updated_at = timezone('utc'::text, now()),
         result = coalesce(result, '{}'::jsonb) ||
                  jsonb_build_object(
                    'internal',
                    coalesce(result->'internal', '{}'::jsonb) ||
                    jsonb_build_object(
                      'workerId', p_worker_id,
                      'claimedAt', timezone('utc'::text, now())
                    )
                  )
   where t.id = v_task_id
   returning t.*;
end;
$$;

grant execute on function shpitto_claim_next_chat_task(text) to anon;
grant execute on function shpitto_claim_next_chat_task(text) to authenticated;
