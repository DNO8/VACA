-- Immutable backend declarations anchored to017 ownership, NOT spending approval.
begin;
create table public.d1_issuance_fee_commitments (
    request_id uuid primary key references public.d1_issuance_sequences(request_id),
    receipt jsonb not null
);
alter table public.d1_issuance_fee_commitments enable row level security;
revoke all on table public.d1_issuance_fee_commitments from public, anon, authenticated, service_role;

create function public.d1_load_issuance_fee_commitments(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_receipt jsonb;
    v_all jsonb;
begin
    -- Preserve018's current-admin -> pool -> preparation/intent -> owner/journal locks.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    select receipt into v_receipt from public.d1_issuance_fee_commitments
        where request_id = p_request_id for update;
    select coalesce(pg_catalog.jsonb_agg(c.receipt order by c.request_id), '[]'::jsonb) into v_all
        from public.d1_issuance_fee_commitments c
        join public.d1_issuance_sequences s on s.request_id = c.request_id
        where s.namespace = (v_lookup ->> 'namespace')::uuid;
    return pg_catalog.jsonb_build_object('kind','d1_issuance_fee_commitment_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','reservation',v_lookup -> 'reservation',
        'commitment',v_receipt,'commitments',v_all);
end;
$$;
create function public.d1_record_issuance_fee_commitment(
    p_request_id uuid, p_authorized_by text, p_issuance_fee_stroops text, p_future_refund_fee_stroops text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_previous jsonb;
    v_reservation jsonb;
    v_deadline text;
    v_receipt jsonb;
begin
    v_lookup := public.d1_load_issuance_fee_commitments(p_request_id, p_authorized_by);
    v_reservation := v_lookup -> 'reservation';
    if v_reservation = 'null'::jsonb then
        raise exception 'd1_issuance_sequence_not_found' using errcode = '22023';
    end if;
    if p_issuance_fee_stroops is null or p_issuance_fee_stroops !~ '^[1-9][0-9]{0,18}$'
       or p_future_refund_fee_stroops is null or p_future_refund_fee_stroops !~ '^[1-9][0-9]{0,18}$' then
        raise exception 'invalid_issuance_fee_commitment' using errcode = '22023';
    end if;
    if p_issuance_fee_stroops::numeric + p_future_refund_fee_stroops::numeric > 9223372036854775807 then
        raise exception 'invalid_issuance_fee_commitment' using errcode = '22023';
    end if;
    v_previous := v_lookup -> 'commitment';
    if v_previous <> 'null'::jsonb then
        if v_previous ->> 'issuance_fee_stroops' <> p_issuance_fee_stroops
           or v_previous ->> 'future_refund_fee_stroops' <> p_future_refund_fee_stroops then
            raise exception 'issuance_fee_commitment_conflict' using errcode = '23505';
        end if;
        return v_previous; -- Original authorizer and expired evidence remain immutable.
    end if;
    select input -> 'request' ->> 'deadline' into strict v_deadline
        from public.d1_preparations where request_id = p_request_id;
    if v_deadline::timestamptz <= pg_catalog.clock_timestamp() then
        raise exception 'deadline_expired' using errcode = '22023';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_issuance_fee_commitment','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,'reservation',v_reservation,
        'issuance_fee_stroops',p_issuance_fee_stroops,'future_refund_fee_stroops',p_future_refund_fee_stroops,
        'deadline',v_deadline);
    insert into public.d1_issuance_fee_commitments values (p_request_id, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_issuance_fee_commitments(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.d1_record_issuance_fee_commitment(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_issuance_fee_commitments(uuid,text) to service_role;
grant execute on function public.d1_record_issuance_fee_commitment(uuid,text,text,text) to service_role;
commit;
