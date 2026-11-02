-- Private opaque fee-history observations; requires 015/019/021. Never financial approval.
begin;
create table public.d1_transaction_checkpoints (
    namespace uuid primary key references public.d1_pools(namespace),
    checkpoint jsonb not null, page_count bigint not null, record_count bigint not null
);
create table public.d1_transaction_pages (
    namespace uuid not null references public.d1_pools(namespace), from_cursor text not null,
    through_ledger bigint not null, ledger_hash text not null, page jsonb not null, receipt jsonb not null,
    primary key (namespace, from_cursor, through_ledger, ledger_hash)
);
create table public.d1_transaction_records (
    namespace uuid not null references public.d1_pools(namespace), paging_token text not null,
    transaction_hash text not null, record jsonb not null,
    primary key (namespace, paging_token), unique (namespace, transaction_hash)
);
alter table public.d1_transaction_checkpoints enable row level security;
alter table public.d1_transaction_pages enable row level security;
alter table public.d1_transaction_records enable row level security;
revoke all on public.d1_transaction_checkpoints, public.d1_transaction_pages,
    public.d1_transaction_records from public, anon, authenticated, service_role;

create function public.d1_load_transaction_history_state(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_income jsonb;
    v_tx public.d1_transaction_checkpoints%rowtype;
    v_covered boolean;
begin
    -- Existing current-admin -> pool -> income checkpoint locks; pool serializes both journals.
    v_income := public.d1_load_discovery_state(p_namespace, p_authorized_by);
    select * into v_tx from public.d1_transaction_checkpoints where namespace = p_namespace for update;
    select exists (select 1 from public.d1_transaction_pages where namespace = p_namespace
        and from_cursor = v_tx.checkpoint ->> 'cursor'
        and page ->> 'to_cursor' = v_tx.checkpoint ->> 'cursor'
        and page -> 'records' = '[]'::jsonb
        and page -> 'through_ledger' = v_tx.checkpoint -> 'through_ledger'
        and page -> 'ledger_hash' = v_tx.checkpoint -> 'ledger_hash'
        and page -> 'closed_at' = v_tx.checkpoint -> 'closed_at'
        and page -> 'through_ledger' = v_income #> '{checkpoint,through_ledger}'
        and page -> 'ledger_hash' = v_income #> '{checkpoint,ledger_hash}'
        and page -> 'closed_at' = v_income #> '{checkpoint,closed_at}'
        and v_income -> 'coverage_complete' = 'true'::jsonb) into v_covered;
    return pg_catalog.jsonb_build_object('kind','d1_transaction_history_state','revision',1,
        'namespace',p_namespace,'network','TESTNET','pool',v_income -> 'pool',
        'first_ledger',v_income -> 'first_ledger','income_state',v_income,
        'checkpoint',v_tx.checkpoint,'page_count',coalesce(v_tx.page_count,0),
        'record_count',coalesce(v_tx.record_count,0),'coverage_complete',v_covered);
end;
$$;
create function public.d1_record_transaction_page(p_namespace uuid, p_authorized_by text, p_page jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_state jsonb; v_income jsonb; v_checkpoint jsonb; v_receipt jsonb;
    v_previous public.d1_transaction_pages%rowtype;
    r jsonb; t jsonb; h jsonb; k text; n numeric; cursor_value numeric;
    v_from text; v_to text; v_ledger bigint; v_pages bigint; v_records bigint;
begin
    v_state := public.d1_load_transaction_history_state(p_namespace,p_authorized_by);
    v_income := v_state -> 'income_state'; v_checkpoint := v_state -> 'checkpoint';
    if pg_catalog.jsonb_typeof(p_page) is distinct from 'object'
       or pg_catalog.octet_length(p_page::text) > 1048576 then
        raise exception 'invalid_transaction_page' using errcode = '22023';
    end if;
    if (p_page ?& array['revision','from_cursor','to_cursor','through_ledger','ledger_hash','closed_at','records']
        and p_page - array['revision','from_cursor','to_cursor','through_ledger','ledger_hash','closed_at','records'] = '{}'
        and p_page -> 'revision' = '1'::jsonb
        and pg_catalog.jsonb_typeof(p_page -> 'records') = 'array'
        and pg_catalog.jsonb_typeof(p_page -> 'through_ledger') = 'number'
        and (p_page ->> 'through_ledger') ~ '^[1-9][0-9]{0,9}$'
        and pg_catalog.jsonb_typeof(p_page -> 'closed_at') = 'number'
        and (p_page ->> 'closed_at') ~ '^(0|[1-9][0-9]{0,11})$'
        and pg_catalog.jsonb_typeof(p_page -> 'ledger_hash') = 'string'
        and (p_page ->> 'ledger_hash') ~ '^[0-9a-f]{64}$') is not true then
        raise exception 'invalid_transaction_page' using errcode = '22023';
    end if;
    v_ledger := (p_page ->> 'through_ledger')::bigint;
    if v_ledger > 4294967295 or v_ledger < (v_state ->> 'first_ledger')::bigint
       or (p_page ->> 'closed_at')::bigint > 253402300799
       or pg_catalog.jsonb_array_length(p_page -> 'records') > 100 then
        raise exception 'invalid_transaction_page' using errcode = '22023';
    end if;
    foreach k in array array['from_cursor','to_cursor'] loop
        if (pg_catalog.jsonb_typeof(p_page -> k) = 'string'
            and (p_page ->> k) ~ '^(0|[1-9][0-9]{0,19})$') is not true then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
        n := (p_page ->> k)::numeric;
        if n > 18446744073709551615 or (n <> 0 and
            (mod(n,4096) <> 0 or mod(trunc(n/4096),1048576) = 0 or trunc(n/4294967296) = 0
             or trunc(n/4294967296) > v_ledger)) then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
    end loop;
    v_from := p_page ->> 'from_cursor'; v_to := p_page ->> 'to_cursor'; cursor_value := v_from::numeric;
    select * into v_previous from public.d1_transaction_pages where namespace = p_namespace
        and from_cursor = v_from and through_ledger = v_ledger and ledger_hash = p_page ->> 'ledger_hash';
    if found then
        if v_previous.page <> p_page then raise exception 'transaction_history_conflict' using errcode = '23505'; end if;
        return v_previous.receipt; -- Current admin required; original receipt, regardless of current income anchor.
    end if;
    for r in select value from pg_catalog.jsonb_array_elements(p_page -> 'records') loop
        if (pg_catalog.jsonb_typeof(r) = 'object' and pg_catalog.octet_length(r::text) <= 131072
            and r ?& array['network','transactionHash','source','sequence','feePayer','feeChargedStroops','feeBidStroops','outcome','ledger','ledgerHash','closedAt','pagingToken','envelopeXdr','resultXdr','operationTypes','poolOperationSourceIndices','raw','context']
            and r - array['network','transactionHash','source','sequence','feePayer','feeChargedStroops','feeBidStroops','outcome','ledger','ledgerHash','closedAt','pagingToken','envelopeXdr','resultXdr','operationTypes','poolOperationSourceIndices','raw','context'] = '{}'
            and r ->> 'network' = 'TESTNET' and r ->> 'outcome' in ('success','failed')
            and pg_catalog.jsonb_typeof(r -> 'transactionHash') = 'string' and (r ->> 'transactionHash') ~ '^[0-9a-f]{64}$'
            and pg_catalog.jsonb_typeof(r -> 'ledgerHash') = 'string' and (r ->> 'ledgerHash') ~ '^[0-9a-f]{64}$'
            and public.release_request_valid_key(r ->> 'source') and r -> 'feePayer' = r -> 'source'
            and pg_catalog.jsonb_typeof(r -> 'ledger') = 'number' and (r ->> 'ledger') ~ '^[1-9][0-9]{0,9}$'
            and pg_catalog.jsonb_typeof(r -> 'closedAt') = 'number' and (r ->> 'closedAt') ~ '^(0|[1-9][0-9]{0,11})$'
            and pg_catalog.jsonb_typeof(r -> 'raw') = 'object' and (r -> 'raw') - array['transaction','ledger'] = '{}'
            and pg_catalog.jsonb_typeof(r #> '{raw,transaction}') = 'object' and pg_catalog.jsonb_typeof(r #> '{raw,ledger}') = 'object'
            and r -> 'context' = pg_catalog.jsonb_build_object('pool',v_state -> 'pool','firstLedger',v_state -> 'first_ledger',
                'anchor',pg_catalog.jsonb_build_object('sequence',v_ledger,'hash',p_page -> 'ledger_hash','closedAt',p_page -> 'closed_at'))
            and pg_catalog.jsonb_typeof(r -> 'operationTypes') = 'array'
            and pg_catalog.jsonb_typeof(r -> 'poolOperationSourceIndices') = 'array') is not true then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
        foreach k in array array['pagingToken','sequence','feeChargedStroops','feeBidStroops'] loop
            if (pg_catalog.jsonb_typeof(r -> k) = 'string' and (r ->> k) ~ '^(0|[1-9][0-9]{0,19})$') is not true then
                raise exception 'invalid_transaction_page' using errcode = '22023';
            end if;
            n := (r ->> k)::numeric;
            if n > (case when k = 'pagingToken' then 18446744073709551615 else 9223372036854775807 end)
               or (k <> 'feeChargedStroops' and n = 0) then
                raise exception 'invalid_transaction_page' using errcode = '22023';
            end if;
        end loop;
        n := (r ->> 'pagingToken')::numeric;
        if mod(n,4096) <> 0 or mod(trunc(n/4096),1048576) = 0 or n <= cursor_value
            or trunc(n/4294967296) <> (r ->> 'ledger')::numeric
            or (r ->> 'ledger')::bigint < (v_state ->> 'first_ledger')::bigint or (r ->> 'ledger')::bigint > v_ledger
            or (r ->> 'closedAt')::bigint > (p_page ->> 'closed_at')::bigint
            or ((r ->> 'ledger')::bigint = v_ledger and (r -> 'ledgerHash' <> p_page -> 'ledger_hash' or r -> 'closedAt' <> p_page -> 'closed_at'))
            or (r ->> 'feeChargedStroops')::numeric > (r ->> 'feeBidStroops')::numeric then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
        cursor_value := n; t := r #> '{raw,transaction}'; h := r #> '{raw,ledger}';
        if (t @> pg_catalog.jsonb_build_object('hash',r -> 'transactionHash','paging_token',r -> 'pagingToken',
            'ledger',r -> 'ledger','source_account',r -> 'source','source_account_sequence',r -> 'sequence',
            'fee_account',r -> 'feePayer','fee_charged',r -> 'feeChargedStroops','max_fee',r -> 'feeBidStroops',
            'successful',r ->> 'outcome' = 'success','envelope_xdr',r -> 'envelopeXdr','result_xdr',r -> 'resultXdr',
            'operation_count',pg_catalog.jsonb_array_length(r -> 'operationTypes'))
            and h @> pg_catalog.jsonb_build_object('sequence',r -> 'ledger','hash',r -> 'ledgerHash',
                'closed_at',pg_catalog.to_char(pg_catalog.to_timestamp((r ->> 'closedAt')::double precision) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
            and t -> 'created_at' = h -> 'closed_at' and not (t ?| array['source_account_muxed','fee_account_muxed'])
            and pg_catalog.jsonb_array_length(r -> 'operationTypes') between 1 and 100) is not true then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
        foreach k in array array['envelopeXdr','resultXdr'] loop
            if (pg_catalog.jsonb_typeof(r -> k) = 'string' and length(r ->> k) between 4 and 65536
                and (r ->> k) ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$') is not true then
                raise exception 'invalid_transaction_page' using errcode = '22023';
            end if;
        end loop;
        if exists (select 1 from pg_catalog.jsonb_array_elements(r -> 'operationTypes') x
            where pg_catalog.jsonb_typeof(x) <> 'number' or x::text !~ '^([0-9]|1[0-9]|2[0-3])$')
            or exists (select 1 from pg_catalog.jsonb_array_elements(r -> 'poolOperationSourceIndices') with ordinality x(value,i)
                where pg_catalog.jsonb_typeof(value) <> 'number' or value::text !~ '^(0|[1-9][0-9]?)$'
                or case when value::text ~ '^(0|[1-9][0-9]?)$' then
                    value::text::numeric >= pg_catalog.jsonb_array_length(r -> 'operationTypes')
                    or (i > 1 and value::text::numeric <= case
                        when (r -> 'poolOperationSourceIndices' ->> (i::int-2)) ~ '^(0|[1-9][0-9]?)$'
                        then (r -> 'poolOperationSourceIndices' ->> (i::int-2))::numeric else -1 end)
                    else true end) then
            raise exception 'invalid_transaction_page' using errcode = '22023';
        end if;
    end loop;
    if cursor_value <> v_to::numeric then raise exception 'invalid_transaction_page' using errcode = '22023'; end if;
    if (v_income -> 'coverage_complete' = 'true'::jsonb
        and v_income #> '{checkpoint,through_ledger}' = p_page -> 'through_ledger'
        and v_income #> '{checkpoint,ledger_hash}' = p_page -> 'ledger_hash'
        and v_income #> '{checkpoint,closed_at}' = p_page -> 'closed_at') is not true
        or v_from <> coalesce(v_checkpoint ->> 'cursor','0')
        or v_ledger < coalesce((v_checkpoint ->> 'through_ledger')::bigint,0)
        or (p_page ->> 'closed_at')::bigint < coalesce((v_checkpoint ->> 'closed_at')::bigint,0)
        or exists (select 1 from public.d1_transaction_pages where namespace = p_namespace and through_ledger = v_ledger
            and (ledger_hash <> p_page ->> 'ledger_hash' or page -> 'closed_at' <> p_page -> 'closed_at')) then
        raise exception 'transaction_history_conflict' using errcode = '23505';
    end if;
    for r in select value from pg_catalog.jsonb_array_elements(p_page -> 'records') loop
        if exists (select 1 from public.d1_transaction_records where namespace = p_namespace
            and (paging_token = r ->> 'pagingToken' or transaction_hash = r ->> 'transactionHash')) then
            raise exception 'transaction_history_conflict' using errcode = '23505';
        end if;
        insert into public.d1_transaction_records values (p_namespace,r ->> 'pagingToken',r ->> 'transactionHash',r);
    end loop;
    v_pages := (v_state ->> 'page_count')::bigint + 1;
    v_records := (v_state ->> 'record_count')::bigint + pg_catalog.jsonb_array_length(p_page -> 'records');
    v_checkpoint := pg_catalog.jsonb_build_object('cursor',v_to,'through_ledger',v_ledger,'ledger_hash',p_page -> 'ledger_hash','closed_at',p_page -> 'closed_at');
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_transaction_page','revision',1,'namespace',p_namespace,
        'network','TESTNET','pool',v_state -> 'pool','first_ledger',v_state -> 'first_ledger','authorized_by',p_authorized_by,
        'page',p_page,'checkpoint',v_checkpoint,'page_count',v_pages,'record_count',v_records,
        'page_record_count',pg_catalog.jsonb_array_length(p_page -> 'records'));
    insert into public.d1_transaction_pages values (p_namespace,v_from,v_ledger,p_page ->> 'ledger_hash',p_page,v_receipt);
    insert into public.d1_transaction_checkpoints values (p_namespace,v_checkpoint,v_pages,v_records)
        on conflict (namespace) do update set checkpoint = excluded.checkpoint,page_count = excluded.page_count,record_count = excluded.record_count;
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_transaction_history_state(uuid,text), public.d1_record_transaction_page(uuid,text,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_transaction_history_state(uuid,text), public.d1_record_transaction_page(uuid,text,jsonb) to service_role;
commit;
