-- LOCAL UNVERIFIED SOURCE: durable ownership, NOT SDK signature or network authority.
begin;
create table public.d1_remainder_signing_attempts (
    request_id uuid primary key references public.d1_remainder_candidates(request_id),
    namespace uuid not null references public.d1_remainder_candidates(namespace),
    snapshot_hash text not null,
    signing_nonce uuid not null unique,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    unique (request_id, signing_nonce),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id),
    foreign key (request_id, snapshot_hash) references public.d1_remainder_financial_observations(request_id, snapshot_hash)
);
create table public.d1_signed_remainder_transactions (
    request_id uuid primary key references public.d1_remainder_candidates(request_id),
    namespace uuid not null references public.d1_remainder_candidates(namespace),
    signing_nonce uuid not null,
    snapshot_hash text not null,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id),
    foreign key (request_id, signing_nonce) references public.d1_remainder_signing_attempts(request_id, signing_nonce),
    foreign key (request_id, snapshot_hash) references public.d1_remainder_financial_observations(request_id, snapshot_hash)
);
alter table public.d1_remainder_signing_attempts enable row level security;
alter table public.d1_signed_remainder_transactions enable row level security;
revoke all on public.d1_remainder_signing_attempts, public.d1_signed_remainder_transactions
    from public, anon, authenticated, service_role;

-- Shared bounded canonical resource check; does NOT parse an envelope or verify a signature.
create function public.d1_remainder_envelope_sha256_private(p_xdr text)
returns text language plpgsql security definer set search_path = '' as $$
declare bytes bytea;
begin
    if p_xdr is null or pg_catalog.octet_length(p_xdr) not between 4 and 65536
       or p_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
        raise exception 'invalid_remainder_xdr' using errcode = '22023';
    end if;
    bytes := pg_catalog.decode(p_xdr,'base64');
    if pg_catalog.replace(pg_catalog.encode(bytes,'base64'),E'\n','') <> p_xdr then
        raise exception 'invalid_remainder_xdr' using errcode = '22023';
    end if;
    return pg_catalog.encode(pg_catalog.sha256(bytes),'hex');
end;
$$;

-- Only internal callers supply a candidate, obtained from the authentic journal, never an approved DTO RPC.
create function public.d1_remainder_fresh_evidence_private(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_candidate jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare evidence jsonb;
begin
    evidence := public.d1_load_remainder_financial_observation(p_request_id,p_authorized_by,p_snapshot_hash) -> 'observation';
    if (pg_catalog.jsonb_typeof(evidence) = 'object' and evidence -> 'snapshot' -> 'candidate' = p_candidate
        and evidence ->> 'snapshot_hash' = p_snapshot_hash
        and evidence -> 'transaction_hash' = p_candidate -> 'transaction_hash'
        and evidence #> '{snapshot,funding,scope,authenticatedAdmin}' = pg_catalog.to_jsonb(p_authorized_by)) is not true then
        raise exception 'remainder_signing_financial_conflict' using errcode = '23505';
    end if;
    -- Actual043 ->042: full independent current membership/money and LAST clock. No035/v1 receipt.
    perform public.d1_revalidate_remainder_financial_snapshot_private(p_request_id,p_authorized_by,evidence -> 'snapshot');
    return evidence;
end;
$$;

create function public.d1_load_remainder_signing_journal(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    lookup jsonb; candidate jsonb; fence jsonb; owner jsonb; unsigned_journal jsonb;
    claim public.d1_remainder_signing_attempts%rowtype; signed public.d1_signed_remainder_transactions%rowtype;
    evidence jsonb; expected jsonb; keys text[];
begin
    --041 preserves admin -> pool -> originals/history ->033 ->040 ->041 locking, including absence.
    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);
    candidate := lookup -> 'candidate'; fence := lookup -> 'fence';
    owner := public.d1_load_active_issuance_sequence((lookup ->> 'namespace')::uuid,p_authorized_by);
    unsigned_journal := public.d1_load_unsigned_transaction(p_request_id,p_authorized_by) -> 'transaction';
    if (owner ->> 'request_id' = p_request_id::text and owner = unsigned_journal -> 'reservation') is not true then
        raise exception 'issuance_source_not_owned' using errcode = '55000';
    end if;
    if candidate <> 'null'::jsonb then
        keys := pg_catalog.string_to_array('kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,acquisition_hash,claimable_balance_id,claim_set_hash,claim_set_count,history_state,gross_stroops,claimed_stroops,remaining_stroops,asset,donor,deadline,source_sequence,transaction_sequence,valid_until,unsigned_xdr,transaction_hash',',');
        if (pg_catalog.jsonb_typeof(candidate) = 'object' and candidate ?& keys and candidate - keys = '{}'
            and candidate ->> 'kind' = 'd1_remainder_candidate' and candidate -> 'revision' = '2'
            and candidate -> 'request_id' = lookup -> 'request_id' and candidate -> 'namespace' = lookup -> 'namespace'
            and candidate -> 'network' = '"TESTNET"' and candidate -> 'pool' = lookup -> 'pool'
            and pg_catalog.jsonb_typeof(candidate -> 'transaction_hash') = 'string'
            and candidate ->> 'transaction_hash' ~ '^[0-9a-f]{64}$'
            and pg_catalog.jsonb_typeof(candidate -> 'unsigned_xdr') = 'string'
            and fence ->> 'lane' = 'verified_remainder_v2' and fence -> 'request_id' = candidate -> 'request_id'
            and fence -> 'namespace' = candidate -> 'namespace' and fence -> 'network' = candidate -> 'network'
            and fence -> 'pool' = candidate -> 'pool' and fence -> 'candidate_hash' = candidate -> 'transaction_hash') is not true then
            raise exception 'remainder_signing_conflict' using errcode = '23505';
        end if;
        perform public.d1_remainder_envelope_sha256_private(candidate ->> 'unsigned_xdr');
    end if;
    select * into claim from public.d1_remainder_signing_attempts where request_id = p_request_id for update;
    select * into signed from public.d1_signed_remainder_transactions where request_id = p_request_id for update;
    if claim.request_id is not null then
        evidence := public.d1_load_remainder_financial_observation(p_request_id,p_authorized_by,claim.snapshot_hash) -> 'observation';
        expected := pg_catalog.jsonb_build_object('kind','d1_remainder_signing_attempt','revision',2,
            'request_id',p_request_id,'namespace',lookup -> 'namespace','network','TESTNET','pool',lookup -> 'pool',
            'authorized_by',claim.receipt -> 'authorized_by','transaction_hash',candidate -> 'transaction_hash',
            'financial_snapshot_hash',claim.snapshot_hash,'signing_nonce',claim.signing_nonce);
        if (claim.namespace::text = lookup ->> 'namespace' and claim.receipt = expected
            and public.release_request_valid_key(claim.receipt ->> 'authorized_by')
            and pg_catalog.jsonb_typeof(evidence) = 'object' and evidence #> '{snapshot,candidate}' = candidate
            and evidence -> 'authorized_by' = claim.receipt -> 'authorized_by') is not true then
            raise exception 'remainder_signing_conflict' using errcode = '23505';
        end if;
    end if;
    if signed.request_id is not null then
        expected := claim.receipt || pg_catalog.jsonb_build_object('kind','d1_signed_remainder_transaction',
            'unsigned_xdr',candidate -> 'unsigned_xdr','signed_xdr',signed.receipt -> 'signed_xdr',
            'envelope_sha256',public.d1_remainder_envelope_sha256_private(signed.receipt ->> 'signed_xdr'));
        if (claim.request_id is not null and signed.namespace = claim.namespace and signed.signing_nonce = claim.signing_nonce
            and signed.snapshot_hash = claim.snapshot_hash and signed.receipt = expected
            and pg_catalog.jsonb_typeof(signed.receipt -> 'signed_xdr') = 'string') is not true then
            raise exception 'remainder_signing_conflict' using errcode = '23505';
        end if;
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    -- No043 here: expired historical bytes and ORIGINAL actors remain readable, not renewed.
    return pg_catalog.jsonb_build_object('kind','d1_remainder_signing_journal_lookup','revision',2,
        'request_id',p_request_id,'namespace',lookup -> 'namespace','network','TESTNET','pool',lookup -> 'pool',
        'candidate',candidate,'claim',claim.receipt,'transaction',signed.receipt);
end;
$$;

create function public.d1_claim_remainder_signing(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_signing_nonce uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare journal jsonb; evidence jsonb; receipt jsonb; inserted boolean;
begin
    journal := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by);
    if journal -> 'claim' <> 'null'::jsonb then
        return journal || pg_catalog.jsonb_build_object('kind','d1_remainder_signing_claim','invoked',false);
    end if;
    if p_signing_nonce is null then raise exception 'invalid_remainder_signing_attempt' using errcode = '22023'; end if;
    evidence := public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    receipt := pg_catalog.jsonb_build_object('kind','d1_remainder_signing_attempt','revision',2,
        'request_id',p_request_id,'namespace',journal -> 'namespace','network','TESTNET','pool',journal -> 'pool',
        'authorized_by',p_authorized_by,'transaction_hash',journal #> '{candidate,transaction_hash}',
        'financial_snapshot_hash',p_snapshot_hash,'signing_nonce',p_signing_nonce);
    insert into public.d1_remainder_signing_attempts values
        (p_request_id,(journal ->> 'namespace')::uuid,p_snapshot_hash,p_signing_nonce,receipt)
        on conflict (signing_nonce) do nothing;
    inserted := found;
    -- Global nonce index may wait on another pool. Recheck SAME A even on nonce conflict.
    perform public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    if not inserted then raise exception 'remainder_signing_conflict' using errcode = '23505'; end if;
    return journal || pg_catalog.jsonb_build_object('kind','d1_remainder_signing_claim','invoked',true,'claim',receipt);
end;
$$;

create function public.d1_record_signed_remainder(
    p_request_id uuid, p_authorized_by text, p_signing_nonce uuid, p_snapshot_hash text,
    p_signed_xdr text, p_envelope_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare journal jsonb; claim jsonb; previous jsonb; receipt jsonb; saved jsonb; digest text;
begin
    journal := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by);
    claim := journal -> 'claim'; previous := journal -> 'transaction';
    digest := public.d1_remainder_envelope_sha256_private(p_signed_xdr);
    if (pg_catalog.jsonb_typeof(claim) = 'object' and claim ->> 'signing_nonce' = p_signing_nonce::text
        and claim ->> 'financial_snapshot_hash' = p_snapshot_hash and p_envelope_sha256 = digest) is not true then
        raise exception 'remainder_signing_conflict' using errcode = '23505';
    end if;
    if previous = 'null'::jsonb and claim ->> 'authorized_by' is distinct from p_authorized_by then
        raise exception 'remainder_signing_actor_conflict' using errcode = '55000';
    end if;
    receipt := claim || pg_catalog.jsonb_build_object('kind','d1_signed_remainder_transaction',
        'unsigned_xdr',journal #> '{candidate,unsigned_xdr}','signed_xdr',p_signed_xdr,'envelope_sha256',digest);
    perform public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    insert into public.d1_signed_remainder_transactions values
        (p_request_id,(journal ->> 'namespace')::uuid,p_signing_nonce,p_snapshot_hash,receipt)
        on conflict (request_id) do nothing;
    saved := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by) -> 'transaction';
    -- Including identical replay: AFTER all insert/select waits, full SAME A/current actor/window.
    perform public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    if saved is distinct from receipt then raise exception 'signed_remainder_conflict' using errcode = '23505'; end if;
    return saved;
end;
$$;

create function public.d1_reject_remainder_execution_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    raise exception 'remainder_execution_immutable' using errcode = '55000';
end;
$$;
create trigger d1_remainder_signing_immutable before update or delete on public.d1_remainder_signing_attempts
    for each row execute function public.d1_reject_remainder_execution_mutation();
create trigger d1_remainder_signing_no_truncate before truncate on public.d1_remainder_signing_attempts
    for each statement execute function public.d1_reject_remainder_execution_mutation();
create trigger d1_signed_remainder_immutable before update or delete on public.d1_signed_remainder_transactions
    for each row execute function public.d1_reject_remainder_execution_mutation();
create trigger d1_signed_remainder_no_truncate before truncate on public.d1_signed_remainder_transactions
    for each statement execute function public.d1_reject_remainder_execution_mutation();
revoke all on function public.d1_remainder_envelope_sha256_private(text),
    public.d1_remainder_fresh_evidence_private(uuid,text,text,jsonb), public.d1_reject_remainder_execution_mutation(),
    public.d1_load_remainder_signing_journal(uuid,text), public.d1_claim_remainder_signing(uuid,text,text,uuid),
    public.d1_record_signed_remainder(uuid,text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_remainder_signing_journal(uuid,text),
    public.d1_claim_remainder_signing(uuid,text,text,uuid), public.d1_record_signed_remainder(uuid,text,uuid,text,text,text) to service_role;
comment on table public.d1_remainder_signing_attempts is
    'Permanent one-shot v2 signing ownership. No TTL, takeover, retry, release or permission from missing bytes.';
comment on table public.d1_signed_remainder_transactions is
    'Immutable opaque bytes, not SDK signature, consensus, submission or terminal proof. Server-only.';
commit;
