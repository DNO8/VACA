-- T01: immutable reservation only. No balance, donor provenance or signing claim.
create table public.release_requests (
    request_id uuid primary key,
    authorized_by text not null,
    request jsonb not null,
    state text not null default 'reserved' check (state = 'reserved'),
    reserved_at timestamptz(3) not null default pg_catalog.clock_timestamp()
);
alter table public.release_requests enable row level security;
-- Override migration 008's inherited default table grants, including mutations.
revoke all on table public.release_requests from public, anon, authenticated, service_role;
grant select on table public.release_requests to service_role;

-- Dependency-free Stellar StrKey validation: 48 version byte + CRC16-XModem.
-- Encoding validity never proves control of a key or provenance of funds.
create function public.release_request_valid_key(p_key text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
    v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_bytes integer[] := array[]::integer[];
    v_buffer integer := 0;
    v_bits integer := 0;
    v_crc integer := 0;
    i integer;
    j integer;
begin
    if p_key is null or p_key collate pg_catalog."C" !~ '^G[A-Z2-7]{55}$' then return false; end if;
    for i in 1..56 loop
        v_buffer := (v_buffer << 5) | (pg_catalog.strpos(v_alphabet, pg_catalog.substr(p_key, i, 1)) - 1);
        v_bits := v_bits + 5;
        if v_bits >= 8 then
            v_bits := v_bits - 8;
            v_bytes := pg_catalog.array_append(v_bytes, (v_buffer >> v_bits) & 255);
            v_buffer := v_buffer & ((1 << v_bits) - 1);
        end if;
    end loop;
    if v_bytes[1] <> 48 then return false; end if;
    for i in 1..33 loop
        v_crc := v_crc # (v_bytes[i] << 8);
        for j in 1..8 loop
            if (v_crc & 32768) <> 0 then
                v_crc := ((v_crc << 1) # 4129) & 65535;
            else
                v_crc := (v_crc << 1) & 65535;
            end if;
        end loop;
    end loop;
    return v_bytes[34] = (v_crc & 255) and v_bytes[35] = (v_crc >> 8);
end;
$$;
revoke all on function public.release_request_valid_key(text) from public, anon, authenticated, service_role;

-- Acceptance matches parseReleaseRequest: strict fields, fixed seven decimals,
-- ASCII incident ID, UTC seconds, checksum-valid G keys; no clock dependency.
create function public.release_request_content(p_request jsonb)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
    v_asset jsonb := p_request -> 'asset';
    v_field text;
    v_deadline timestamptz;
begin
    -- Guard shape separately; SQL boolean evaluation order is not guaranteed.
    if pg_catalog.jsonb_typeof(p_request) is distinct from 'object' then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if not (p_request ?& array['version','incident_id','donor','beneficiary','asset','amount','deadline'])
       or p_request - array['version','incident_id','donor','beneficiary','asset','amount','deadline'] <> '{}'::jsonb
       or p_request -> 'version' is distinct from '1'::jsonb then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    foreach v_field in array array['incident_id','donor','beneficiary','amount','deadline'] loop
        if pg_catalog.jsonb_typeof(p_request -> v_field) is distinct from 'string' then
            raise exception 'invalid_release_request' using errcode = '22023';
        end if;
    end loop;
    if (p_request ->> 'incident_id') collate pg_catalog."C" !~ '^[!-~]([ -~]{0,254}[!-~])?$'
       or not public.release_request_valid_key(p_request ->> 'donor')
       or not public.release_request_valid_key(p_request ->> 'beneficiary')
       or (p_request ->> 'amount') collate pg_catalog."C" !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$' then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if (p_request ->> 'amount')::numeric <= 0
       or (p_request ->> 'amount')::numeric * 10000000 > 9223372036854775807 then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(v_asset) is distinct from 'object' then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if v_asset ->> 'type' = 'native' then
        if v_asset <> '{"type":"native"}'::jsonb then
            raise exception 'invalid_release_request' using errcode = '22023';
        end if;
    elsif v_asset ->> 'type' = 'issued' then
        if not (v_asset ?& array['type','code','issuer'])
           or v_asset - array['type','code','issuer'] <> '{}'::jsonb
           or pg_catalog.jsonb_typeof(v_asset -> 'code') is distinct from 'string'
           or pg_catalog.jsonb_typeof(v_asset -> 'issuer') is distinct from 'string'
           or (v_asset ->> 'code') collate pg_catalog."C" !~ '^[A-Za-z0-9]{1,12}$'
           or not public.release_request_valid_key(v_asset ->> 'issuer') then
            raise exception 'invalid_release_request' using errcode = '22023';
        end if;
    else
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if (p_request ->> 'deadline') collate pg_catalog."C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
       or pg_catalog.left(p_request ->> 'deadline', 4) = '0000' then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    begin
        v_deadline := (p_request ->> 'deadline')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'invalid_release_request' using errcode = '22023';
    end;
    if pg_catalog.to_char(v_deadline at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') <> p_request ->> 'deadline' then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    -- JSONB is the authoritative normalized identity, not an untrusted hash.
    return p_request;
end;
$$;
revoke all on function public.release_request_content(jsonb) from public, anon, authenticated, service_role;

create function public.reserve_release_request(
    p_request_id uuid, p_authorized_by text, p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_content jsonb;
    v_existing public.release_requests%rowtype;
    v_incident public.incidents%rowtype;
begin
    -- EXECUTE grants authenticate the caller's DB role, not current_user:
    -- SECURITY DEFINER runs as the owner. This does not verify a wallet signature.
    if p_request_id is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception 'invalid_release_request' using errcode = '22023';
    end if;
    if not exists (select 1 from public.admin_wallets a where a.public_key = p_authorized_by) then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    v_content := public.release_request_content(p_request);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vaca.release-request.v1:' || p_request_id::text, 0));
    select * into v_existing from public.release_requests r where r.request_id = p_request_id;
    if found then
        if v_existing.authorized_by <> p_authorized_by or v_existing.request <> v_content then
            raise exception 'idempotency_conflict' using errcode = '23505';
        end if;
    else
        -- Stabilize the incident snapshot until this reservation commits.
        select * into v_incident from public.incidents i
        where i.incident_id = v_content ->> 'incident_id' for share;
        if not found or v_incident.donation_status not in ('community', 'vaquita') then
            raise exception 'incident_not_promoted' using errcode = '22023';
        end if;
        if v_incident.stellar_pubkey is distinct from v_content ->> 'beneficiary' then
            raise exception 'beneficiary_mismatch' using errcode = '22023';
        end if;
        if (v_content ->> 'deadline')::timestamptz <= pg_catalog.clock_timestamp() then
            raise exception 'deadline_expired' using errcode = '22023';
        end if;
        insert into public.release_requests (request_id, authorized_by, request)
        values (p_request_id, p_authorized_by, v_content) returning * into v_existing;
    end if;
    return pg_catalog.jsonb_build_object(
        'request_id', v_existing.request_id, 'authorized_by', v_existing.authorized_by,
        'request', v_existing.request, 'state', v_existing.state,
        'reserved_at', pg_catalog.to_char(v_existing.reserved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
end;
$$;
revoke all on function public.reserve_release_request(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reserve_release_request(uuid, text, jsonb) to service_role;
comment on table public.release_requests is
    'Private immutable reservations; declared donor only, no confirmed Stellar balance. Different UUIDs are not economic deduplication.';
