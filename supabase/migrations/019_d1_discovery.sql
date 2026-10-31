-- Local opaque observations only; requires 015. No Horizon consensus/funding proof.
begin;
create table public.d1_discovery_checkpoints (
    namespace uuid primary key references public.d1_pools(namespace),
    checkpoint jsonb not null,
    page_count bigint not null
);
create table public.d1_discovery_pages (
    namespace uuid not null references public.d1_pools(namespace),
    from_cursor text not null,
    through_ledger bigint not null,
    ledger_hash text not null,
    page jsonb not null,
    receipt jsonb not null,
    primary key (namespace, from_cursor, through_ledger, ledger_hash)
);
create table public.d1_discovery_operations (
    namespace uuid not null references public.d1_pools(namespace),
    paging_token text not null,
    transaction_hash text not null,
    operation_id text not null,
    record jsonb not null,
    primary key (namespace, paging_token),
    unique (namespace, transaction_hash, operation_id)
);
alter table public.d1_discovery_checkpoints enable row level security;
alter table public.d1_discovery_pages enable row level security;
alter table public.d1_discovery_operations enable row level security;
revoke all on table public.d1_discovery_checkpoints, public.d1_discovery_pages,
    public.d1_discovery_operations from public, anon, authenticated, service_role;

create function public.d1_load_discovery_checkpoint(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_pool public.d1_pools%rowtype;
    v_checkpoint jsonb;
begin
    if p_namespace is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception 'invalid_discovery_page' using errcode = '22023';
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Pool lock also serializes absent checkpoints and all page/operation writes.
    select * into v_pool from public.d1_pools where namespace = p_namespace for update;
    if not found then
        raise exception 'pool_not_activated' using errcode = '22023';
    end if;
    select checkpoint into v_checkpoint from public.d1_discovery_checkpoints
        where namespace = p_namespace for update;
    return pg_catalog.jsonb_build_object('kind', 'd1_discovery_checkpoint_lookup',
        'revision', 1, 'namespace', p_namespace, 'network', 'TESTNET',
        'pool', v_pool.pool, 'checkpoint', v_checkpoint);
end;
$$;

create function public.d1_record_discovery_page(p_namespace uuid, p_authorized_by text, p_page jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_checkpoint jsonb;
    v_previous public.d1_discovery_pages%rowtype;
    v_record jsonb;
    v_cursor numeric;
    v_from text;
    v_to text;
    v_ledger bigint;
    v_count bigint;
    v_receipt jsonb;
begin
    -- Reuse authorization/namespace derivation and admin -> pool -> checkpoint locks.
    v_lookup := public.d1_load_discovery_checkpoint(p_namespace, p_authorized_by);
    v_checkpoint := v_lookup -> 'checkpoint';
    if pg_catalog.jsonb_typeof(p_page) is distinct from 'object'
       or pg_catalog.octet_length(p_page::text) > 1048576 then
        raise exception 'invalid_discovery_page' using errcode = '22023';
    end if;
    if not (p_page ?& array['revision','from_cursor','to_cursor','through_ledger','ledger_hash','closed_at','records'])
       or p_page - array['revision','from_cursor','to_cursor','through_ledger','ledger_hash','closed_at','records'] <> '{}'
       or p_page -> 'revision' is distinct from '1'::jsonb
       or pg_catalog.jsonb_typeof(p_page -> 'through_ledger') is distinct from 'number'
       or (p_page ->> 'through_ledger') !~ '^(0|[1-9][0-9]{0,9})$'
       or pg_catalog.jsonb_typeof(p_page -> 'closed_at') is distinct from 'number'
       or (p_page ->> 'closed_at') !~ '^(0|[1-9][0-9]{0,11})$'
       or pg_catalog.jsonb_typeof(p_page -> 'ledger_hash') is distinct from 'string'
       or (p_page ->> 'ledger_hash') !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(p_page -> 'records') is distinct from 'array' then
        raise exception 'invalid_discovery_page' using errcode = '22023';
    end if;
    if (p_page ->> 'through_ledger')::numeric > 4294967295
       or (p_page ->> 'closed_at')::numeric > 253402300799
       or pg_catalog.jsonb_array_length(p_page -> 'records') > 200 then
        raise exception 'invalid_discovery_page' using errcode = '22023';
    end if;
    foreach v_from in array array['from_cursor','to_cursor'] loop
        if pg_catalog.jsonb_typeof(p_page -> v_from) is distinct from 'string'
           or (p_page ->> v_from) !~ '^(0|[1-9][0-9]{0,19})$' then
            raise exception 'invalid_discovery_page' using errcode = '22023';
        end if;
        if (p_page ->> v_from)::numeric > 18446744073709551615 then
            raise exception 'invalid_discovery_page' using errcode = '22023';
        end if;
    end loop;
    v_from := p_page ->> 'from_cursor';
    v_to := p_page ->> 'to_cursor';
    v_cursor := v_from::numeric;
    v_ledger := (p_page ->> 'through_ledger')::bigint;
    for v_record in select value from pg_catalog.jsonb_array_elements(p_page -> 'records') loop
        if pg_catalog.jsonb_typeof(v_record) is distinct from 'object'
           or not (v_record ?& array['paging_token','ledger','transaction_hash','operation_id','operation'])
           or v_record - array['paging_token','ledger','transaction_hash','operation_id','operation'] <> '{}'
           or pg_catalog.jsonb_typeof(v_record -> 'ledger') is distinct from 'number'
           or (v_record ->> 'ledger') !~ '^(0|[1-9][0-9]{0,9})$'
           or pg_catalog.jsonb_typeof(v_record -> 'transaction_hash') is distinct from 'string'
           or (v_record ->> 'transaction_hash') !~ '^[0-9a-f]{64}$'
           or pg_catalog.jsonb_typeof(v_record -> 'operation') is distinct from 'object'
           or pg_catalog.octet_length((v_record -> 'operation')::text) > 16384 then
            raise exception 'invalid_discovery_page' using errcode = '22023';
        end if;
        foreach v_count in array array[1,2]::bigint[] loop
            -- Both Horizon IDs remain exact decimal strings, never floats/bigint.
            if pg_catalog.jsonb_typeof(v_record -> (case v_count when 1 then 'paging_token' else 'operation_id' end))
                 is distinct from 'string'
               or (v_record ->> (case v_count when 1 then 'paging_token' else 'operation_id' end))
                 !~ '^[1-9][0-9]{0,19}$' then
                raise exception 'invalid_discovery_page' using errcode = '22023';
            end if;
            if (v_record ->> (case v_count when 1 then 'paging_token' else 'operation_id' end))::numeric
                 > 18446744073709551615 then
                raise exception 'invalid_discovery_page' using errcode = '22023';
            end if;
        end loop;
        if (v_record ->> 'ledger')::numeric > v_ledger
           or (v_record ->> 'paging_token')::numeric <= v_cursor then
            raise exception 'invalid_discovery_page' using errcode = '22023';
        end if;
        v_cursor := (v_record ->> 'paging_token')::numeric;
    end loop;
    if v_cursor <> v_to::numeric then
        raise exception 'invalid_discovery_page' using errcode = '22023';
    end if;
    select * into v_previous from public.d1_discovery_pages where namespace = p_namespace
        and from_cursor = v_from and through_ledger = v_ledger and ledger_hash = p_page ->> 'ledger_hash';
    if found then
        if v_previous.page <> p_page then
            raise exception 'discovery_conflict' using errcode = '23505';
        end if;
        return v_previous.receipt; -- Original receipt, never rewind current checkpoint.
    end if;
    if v_from <> coalesce(v_checkpoint ->> 'cursor', '0')
       or v_ledger < coalesce((v_checkpoint ->> 'through_ledger')::bigint, 0)
       or (p_page ->> 'closed_at')::bigint < coalesce((v_checkpoint ->> 'closed_at')::bigint, 0)
       or exists (select 1 from public.d1_discovery_pages where namespace = p_namespace
           and through_ledger = v_ledger and (ledger_hash <> p_page ->> 'ledger_hash'
             or page -> 'closed_at' <> p_page -> 'closed_at')) then
        raise exception 'discovery_conflict' using errcode = '23505';
    end if;
    for v_record in select value from pg_catalog.jsonb_array_elements(p_page -> 'records') loop
        perform 1 from public.d1_discovery_operations where namespace = p_namespace
            and (paging_token = v_record ->> 'paging_token'
              or (transaction_hash = v_record ->> 'transaction_hash' and operation_id = v_record ->> 'operation_id'))
            for update;
        if found then
            raise exception 'discovery_conflict' using errcode = '23505';
        end if;
        insert into public.d1_discovery_operations values (p_namespace, v_record ->> 'paging_token',
            v_record ->> 'transaction_hash', v_record ->> 'operation_id', v_record);
    end loop;
    select page_count into v_count from public.d1_discovery_checkpoints where namespace = p_namespace;
    v_count := coalesce(v_count, 0) + 1;
    v_checkpoint := pg_catalog.jsonb_build_object('cursor', v_to, 'through_ledger', v_ledger,
        'ledger_hash', p_page -> 'ledger_hash', 'closed_at', p_page -> 'closed_at');
    v_receipt := pg_catalog.jsonb_build_object('kind', 'd1_discovery_page', 'revision', 1,
        'namespace', p_namespace, 'network', 'TESTNET', 'pool', v_lookup -> 'pool',
        'from_cursor', v_from, 'to_cursor', v_to, 'checkpoint_ledger', v_ledger,
        'checkpoint_hash', p_page -> 'ledger_hash', 'page_count', v_count,
        'record_count', pg_catalog.jsonb_array_length(p_page -> 'records'));
    insert into public.d1_discovery_pages values (p_namespace, v_from, v_ledger,
        p_page ->> 'ledger_hash', p_page, v_receipt);
    insert into public.d1_discovery_checkpoints values (p_namespace, v_checkpoint, v_count)
        on conflict (namespace) do update set checkpoint = excluded.checkpoint, page_count = excluded.page_count;
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_discovery_checkpoint(uuid,text),
    public.d1_record_discovery_page(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_discovery_checkpoint(uuid,text),
    public.d1_record_discovery_page(uuid,text,jsonb) to service_role;
comment on table public.d1_discovery_operations is
    'Opaque immutable observations, including outgoing/unsupported operations; not verified donation or readiness truth.';
commit;
