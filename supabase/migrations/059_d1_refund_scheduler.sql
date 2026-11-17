-- Requires reviewed pg_cron, pg_net and Vault interfaces; installs none of them.
-- Independent of financial tables. No enrollment, signer, token or activation.
begin;
create schema d1_scheduler;
revoke all on schema d1_scheduler from public, anon, authenticated, service_role;

create table d1_scheduler.state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  after_request_id uuid,
  pending_request_id bigint,
  dispatched_at timestamptz,
  pause_reason text,
  cron_job_id bigint,
  check ((pending_request_id is null) = (dispatched_at is null))
);
alter table d1_scheduler.state enable row level security;
insert into d1_scheduler.state(singleton) values (true);

create function d1_scheduler.status() returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object('enabled',enabled,'afterRequestId',after_request_id,
    'pendingRequestId',pending_request_id,'pauseReason',pause_reason)
  from d1_scheduler.state where singleton;
$$;

create function d1_scheduler.set_enabled(p_enabled boolean) returns text
language plpgsql security invoker set search_path = pg_catalog as $$
declare s d1_scheduler.state;
begin
  if p_enabled is null then raise exception 'invalid_scheduler_configuration'; end if;
  select * into strict s from d1_scheduler.state where singleton for update;
  if p_enabled and (s.pending_request_id is not null or s.pause_reason is not null) then
    raise exception 'scheduler_reconciliation_required';
  end if;
  perform cron.alter_job(s.cron_job_id, active := p_enabled);
  update d1_scheduler.state set enabled = p_enabled where singleton;
  return case when p_enabled then 'enabled' else 'disabled' end;
end;
$$;

create function d1_scheduler.tick() returns text
language plpgsql security invoker set search_path = pg_catalog as $$
declare
  s d1_scheduler.state;
  r record;
  body json;
  next_cursor uuid;
  processed numeric;
  held numeric;
  reason text;
  gateway_jwt text;
  tick_token text;
  request_id bigint;
begin
  -- Row lock serializes dispatch; logged pending ownership outlives this lock.
  select * into strict s from d1_scheduler.state where singleton for update;
  if not s.enabled then return 'disabled'; end if;
  if s.pause_reason is not null then return 'paused'; end if;

  if s.pending_request_id is not null then
    begin
      select * into strict r from net._http_response where id = s.pending_request_id;
    exception
      when no_data_found then
        if clock_timestamp() < s.dispatched_at + interval '90 seconds' then return 'pending'; end if;
        update d1_scheduler.state set pause_reason = 'response_missing' where singleton;
        return 'paused';
      when others then
        update d1_scheduler.state set pause_reason = 'response_unavailable' where singleton;
        return 'paused';
    end;
    if r.timed_out is distinct from false or r.error_msg is not null then
      reason := 'transport_error';
    elsif r.status_code is distinct from 200 then
      reason := 'http_error';
    else
      begin
        if r.content is null or octet_length(r.content) > 1024 then raise exception 'invalid'; end if;
        body := r.content::json;
        if json_typeof(body) is distinct from 'object' then raise exception 'invalid'; end if;
        if (select count(*) from json_object_keys(body)) <> 3
          or (select count(distinct k) from json_object_keys(body) k) <> 3
          or json_typeof(body->'processed') is distinct from 'number'
          or json_typeof(body->'held') is distinct from 'number'
          or json_typeof(body->'nextAfterRequestId') not in ('null','string')
          or body->'nextAfterRequestId' is null then raise exception 'invalid'; end if;
        processed := (body->>'processed')::numeric;
        held := (body->>'held')::numeric;
        if processed < 0 or processed > 50 or processed <> trunc(processed)
          or held < 0 or held > processed or held <> trunc(held) then raise exception 'invalid'; end if;
        if json_typeof(body->'nextAfterRequestId') = 'string' then
          if (body->>'nextAfterRequestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            raise exception 'invalid';
          end if;
          next_cursor := (body->>'nextAfterRequestId')::uuid;
          if s.after_request_id is not null and next_cursor <= s.after_request_id then raise exception 'invalid'; end if;
        end if;
        if held > 0 then reason := 'held'; end if;
      exception when others then reason := 'invalid_response';
      end;
    end if;
    if reason is not null then
      update d1_scheduler.state set pause_reason = reason where singleton;
      return 'paused';
    end if;
    update d1_scheduler.state set after_request_id = next_cursor,
      pending_request_id = null, dispatched_at = null where singleton;
    -- One action per cron invocation: a later invocation sends the next page/sweep.
    return 'advanced';
  end if;

  begin
    -- pg_net queues decrypted headers. Do not silently change shared extension ACLs.
    -- Reject grants (including column grants) to anyone other than table owner,
    -- current operator or superusers before reading the two Vault values.
    if exists (
      select 1 from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      left join pg_roles p on p.oid = a.grantee
      where c.oid = 'net.http_request_queue'::regclass
        and a.grantee <> c.relowner and a.grantee <> current_user::regrole
        and not coalesce(p.rolsuper,false)
    ) or exists (
      select 1 from pg_attribute col join pg_class c on c.oid = col.attrelid
      cross join lateral aclexplode(col.attacl) a
      left join pg_roles p on p.oid = a.grantee
      where c.oid = 'net.http_request_queue'::regclass
        and a.grantee <> c.relowner and a.grantee <> current_user::regrole
        and not coalesce(p.rolsuper,false)
    ) then raise exception 'unsafe_queue_access'; end if;
    select decrypted_secret into strict gateway_jwt from vault.decrypted_secrets where name = 'd1_refund_gateway_jwt';
    select decrypted_secret into strict tick_token from vault.decrypted_secrets where name = 'd1_refund_tick_token';
    if gateway_jwt is null or gateway_jwt !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
      or octet_length(gateway_jwt) > 8192 or tick_token is null
      or tick_token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then raise exception 'invalid_credentials'; end if;
    request_id := net.http_post(
      url := 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/internal-refund-tick',
      body := jsonb_build_object('afterRequestId',s.after_request_id),
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer '||gateway_jwt,'x-d1-refund-token',tick_token),
      timeout_milliseconds := 30000);
    if request_id is null or request_id <= 0 then raise exception 'invalid_request_id'; end if;
    update d1_scheduler.state set pending_request_id = request_id,
      dispatched_at = clock_timestamp() where singleton;
  exception when others then
    -- This subtransaction rolls back enqueue and state together. Never log SQLERRM
    -- or retry; a broken extension/credential interface requires operator review.
    update d1_scheduler.state set pause_reason = 'configuration_error' where singleton;
    return 'paused';
  end;
  return 'dispatched';
end;
$$;

revoke all on all tables in schema d1_scheduler from public, anon, authenticated, service_role;
revoke all on all functions in schema d1_scheduler from public, anon, authenticated, service_role;

do $$
declare job_id bigint;
begin
  if exists (select 1 from cron.job where jobname = 'd1-refund-tick') then
    raise exception 'scheduler_job_already_exists';
  end if;
  job_id := cron.schedule('d1-refund-tick','* * * * *','select d1_scheduler.tick();');
  perform cron.alter_job(job_id, active := false);
  update d1_scheduler.state set cron_job_id = job_id where singleton;
end;
$$;
commit;
