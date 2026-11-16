-- LOCAL UNVERIFIED SOURCE: one-shot signing ownership and opaque bytes, not chain proof.
begin;
create table public.d1_refund_signing_attempts (
    request_id uuid primary key,
    namespace uuid not null,
    snapshot_hash text not null,
    signing_nonce uuid not null unique,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    unique (request_id, signing_nonce),
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id),
    foreign key (request_id, snapshot_hash)
        references public.d1_refund_financial_observations(request_id, snapshot_hash)
);
create table public.d1_signed_refund_transactions (
    request_id uuid primary key,
    namespace uuid not null,
    signing_nonce uuid not null,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id),
    foreign key (request_id, signing_nonce) references public.d1_refund_signing_attempts(request_id, signing_nonce)
);
alter table public.d1_refund_signing_attempts enable row level security;
alter table public.d1_signed_refund_transactions enable row level security;
revoke all on public.d1_refund_signing_attempts, public.d1_signed_refund_transactions
    from public, anon, authenticated, service_role;

create function public.d1_load_refund_signing_journal(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lookup jsonb; v_claim jsonb; v_transaction jsonb;
begin
    -- Inherit scope -> pool -> initial history ->033/034 locks.
    -- Pool FOR UPDATE serializes absent claim and transaction rows too.
    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    -- Independent authorization:053 candidate reads never authorize journal disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    select receipt into v_claim from public.d1_refund_signing_attempts
        where request_id = p_request_id for update;
    select receipt into v_transaction from public.d1_signed_refund_transactions
        where request_id = p_request_id for update;
    if v_claim is null and v_transaction is not null then
        raise exception 'refund_signing_conflict' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_refund_signing_journal_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','candidate',v_lookup -> 'candidate','claim',v_claim,'transaction',v_transaction);
end;
$$;

create function public.d1_claim_refund_signing(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_signing_nonce uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_journal jsonb; v_evidence jsonb; v_fresh jsonb; v_claim jsonb;
begin
    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independently gate validation, existing-claim replay and new signing ownership.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' or p_signing_nonce is null then
        raise exception 'invalid_refund_signing_attempt' using errcode = '22023';
    end if;
    if v_journal -> 'claim' <> 'null'::jsonb then
        -- Even the identical nonce NEVER authorizes another private signer call.
        -- No TTL, expiry, crash, missing bytes or different actor can reclaim it.
        return v_journal || pg_catalog.jsonb_build_object('kind','d1_refund_signing_claim','invoked',false);
    end if;
    if v_journal -> 'candidate' is null or v_journal -> 'candidate' = 'null'::jsonb then
        raise exception 'd1_refund_candidate_not_found' using errcode = '22023';
    end if;
    v_evidence := public.d1_load_refund_financial_observation(
        p_request_id, p_authorized_by, p_snapshot_hash) -> 'observation';
    if v_evidence is null or v_evidence = 'null'::jsonb then
        raise exception 'd1_refund_financial_observation_not_found' using errcode = '22023';
    end if;
    --035 revalidates current admin, BOTH033/034 owners, complete027 commitment,
    -- history/credit/anchor/economics and final clock even for exact-hash replay.
    -- It rejects new permission under retained RR/Serializable snapshots.
    v_fresh := public.d1_record_refund_financial_observation(
        p_request_id, p_authorized_by, v_evidence -> 'snapshot');
    if v_fresh is distinct from v_evidence or v_fresh ->> 'snapshot_hash' is distinct from p_snapshot_hash
       or v_fresh -> 'transaction_hash' is distinct from v_journal #> '{candidate,transaction_hash}' then
        raise exception 'refund_signing_conflict' using errcode = '23505';
    end if;
    v_claim := pg_catalog.jsonb_build_object('kind','d1_refund_signing_attempt','revision',1,
        'request_id',p_request_id,'namespace',v_journal -> 'namespace','network','TESTNET',
        'pool',v_journal -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',v_journal #> '{candidate,transaction_hash}',
        'financial_snapshot_hash',p_snapshot_hash,'signing_nonce',p_signing_nonce);
    insert into public.d1_refund_signing_attempts values
        (p_request_id,(v_journal ->> 'namespace')::uuid,p_snapshot_hash,p_signing_nonce,v_claim);
    -- Global nonce uniqueness can wait on ANOTHER pool, beyond our pool lock.
    -- Recheck after that wait; expiry/error rolls back this new claim entirely.
    v_fresh := public.d1_record_refund_financial_observation(
        p_request_id, p_authorized_by, v_evidence -> 'snapshot');
    if v_fresh is distinct from v_evidence then
        raise exception 'refund_signing_conflict' using errcode = '23505';
    end if;
    return v_journal || pg_catalog.jsonb_build_object('kind','d1_refund_signing_claim','invoked',true,'claim',v_claim);
end;
$$;

create function public.d1_record_signed_refund_transaction(
    p_request_id uuid, p_authorized_by text, p_signing_nonce uuid,
    p_signed_xdr text, p_transaction_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_journal jsonb; v_claim jsonb; v_previous jsonb; v_evidence jsonb; v_fresh jsonb;
    v_bytes bytea; v_receipt jsonb; v_snapshot_hash text;
begin
    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independently gate validation, signed-byte replay and new signed evidence.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    if p_signing_nonce is null or p_transaction_hash is null or p_transaction_hash !~ '^[0-9a-f]{64}$'
       or p_signed_xdr is null or pg_catalog.octet_length(p_signed_xdr) not between 4 and 65536
       or p_signed_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
        raise exception 'invalid_signed_refund_transaction' using errcode = '22023';
    end if;
    v_bytes := pg_catalog.decode(p_signed_xdr,'base64');
    if pg_catalog.replace(pg_catalog.encode(v_bytes,'base64'), E'\n','') <> p_signed_xdr then
        raise exception 'invalid_signed_refund_transaction' using errcode = '22023';
    end if;
    v_claim := v_journal -> 'claim';
    if v_claim is null or v_claim = 'null'::jsonb then
        raise exception 'd1_refund_signing_attempt_not_found' using errcode = '22023';
    end if;
    if v_claim ->> 'signing_nonce' is distinct from p_signing_nonce::text
       or v_claim ->> 'transaction_hash' is distinct from p_transaction_hash
       or v_journal #>> '{candidate,transaction_hash}' is distinct from p_transaction_hash then
        raise exception 'refund_signing_conflict' using errcode = '23505';
    end if;
    v_previous := v_journal -> 'transaction';
    if v_previous <> 'null'::jsonb then
        if v_previous ->> 'signed_xdr' is distinct from p_signed_xdr
           or v_previous ->> 'signing_nonce' is distinct from p_signing_nonce::text
           or v_previous ->> 'transaction_hash' is distinct from p_transaction_hash then
            raise exception 'signed_refund_transaction_conflict' using errcode = '23505';
        end if;
        return v_previous; -- Immutable historical evidence, NOT new submission permission.
    end if;
    -- Only the original claim actor can finish this one-shot signing invocation.
    if v_claim ->> 'authorized_by' is distinct from p_authorized_by then
        raise exception 'refund_signing_actor_conflict' using errcode = '55000';
    end if;
    v_snapshot_hash := v_claim ->> 'financial_snapshot_hash';
    v_evidence := public.d1_load_refund_financial_observation(
        p_request_id, p_authorized_by, v_snapshot_hash) -> 'observation';
    if v_evidence is null or v_evidence = 'null'::jsonb then
        raise exception 'd1_refund_financial_observation_not_found' using errcode = '22023';
    end if;
    v_fresh := public.d1_record_refund_financial_observation(
        p_request_id, p_authorized_by, v_evidence -> 'snapshot');
    if v_fresh is distinct from v_evidence
       or v_fresh ->> 'snapshot_hash' is distinct from v_snapshot_hash
       or v_fresh ->> 'transaction_hash' is distinct from p_transaction_hash then
        raise exception 'refund_signing_conflict' using errcode = '23505';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_signed_refund_transaction','revision',1,
        'request_id',p_request_id,'namespace',v_journal -> 'namespace','network','TESTNET',
        'pool',v_journal -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',p_transaction_hash,'financial_snapshot_hash',v_snapshot_hash,
        'signing_nonce',p_signing_nonce,'signed_xdr',p_signed_xdr,
        'envelope_hash',pg_catalog.encode(pg_catalog.sha256(v_bytes),'hex'));
    insert into public.d1_signed_refund_transactions values
        (p_request_id,(v_journal ->> 'namespace')::uuid,p_signing_nonce,v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_refund_signing_journal(uuid,text),
    public.d1_claim_refund_signing(uuid,text,text,uuid),
    public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_signing_journal(uuid,text),
    public.d1_claim_refund_signing(uuid,text,text,uuid),
    public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text) to service_role;
comment on table public.d1_refund_signing_attempts is
    'Permanent one-shot signing ownership; repeated claim invoked=false, no TTL/reclaim/reassignment/retry/release API. Nonce stays server-only.';
comment on table public.d1_signed_refund_transactions is
    'Immutable opaque signed bytes and envelope SHA256, not SDK body/signature/chain proof or fresh submission permission. Never expose signed bytes over HTTP.';
commit;
