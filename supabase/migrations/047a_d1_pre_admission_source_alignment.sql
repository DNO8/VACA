-- Forward-only alignment of the observed pre048 deployment to canonical036–040.
-- Run after047, BEFORE048; no data, enrollment, caller activation or pin changes.
-- Exact canonical bodies are a no-op; unknown body/catalog drift aborts atomically.
begin;
do $migration$
declare
    v_expected record; v_proc pg_catalog.pg_proc%rowtype;
    v_body text; v_new_body text; v_definition text; v_prefix text; v_i integer;
    v_replacements text[] := array[]::text[];
begin
    for v_expected in select * from (values
        ('public.d1_acquire_refund_lane_fence_private(uuid,uuid,text,text,text)','3744ffa41ca206c7d329f569db3197e8','a94851b052a714967abfb20b14b122ab','p_namespace,p_request_id,p_authorized_by,p_candidate_hash,p_lane',true,
         array[$body$    -- Actual032 ->031 ->030 ->018: current admin -> pool FOR UPDATE -> history.
$body$],
         array[$body$    --032 ->031 ->030 ->018: admitted actor -> pool FOR UPDATE -> history.
    -- Later readers admit service scopes; callers must enforce write authority.
    -- These private helpers remain ungranted to all API roles.
$body$]),
        ('public.d1_claim_refund_signing(uuid,text,text,uuid)','7b8978f2e56e724d8c33e55ec543471b','5bd65aaa363a760c7ba61d55d7923632','p_request_id,p_authorized_by,p_snapshot_hash,p_signing_nonce',false,
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independently gate validation, existing-claim replay and new signing ownership.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_claim_refund_submission_attempt(uuid,text,text,uuid)','c9a0a47489402bf3da45c14e9617b41f','fca48769781a83fba8c66385fcea2087','p_request_id,p_authorized_by,p_snapshot_hash,p_attempt_id',false,
         array[$body$    v_lookup := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_lookup := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
    -- Independently gate existing-attempt replay, validation and new send ownership.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_load_refund_outcome(uuid,text)','ca2e3d50303e8094304b5c04aab53195','9ba439822aabe42a39048e37346638ae','p_request_id,p_authorized_by',false,
         array[$body$    v_scope := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_scope := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
    -- Independent authorization: scoped evidence reads never authorize outcome disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_load_refund_signing_journal(uuid,text)','0a51aece7a36d12a53a2ca5c24b280e1','b09c15a48e31e9907d2fb6b72ed0c144','p_request_id,p_authorized_by',false,
         array[$body$    -- Inherit current-admin -> pool -> initial history ->033/034 locks.
$body$,$body$    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
$body$],
         array[$body$    -- Inherit scope -> pool -> initial history ->033/034 locks.
$body$,$body$    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    -- Independent authorization:053 candidate reads never authorize journal disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_load_refund_submission_attempt(uuid,text)','8c2bb7db4003b2a5c11c48cdf2a513fc','4ef2c26f7bd81457d49ea9a7c8794589','p_request_id,p_authorized_by',false,
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independent authorization: scoped evidence reads never authorize disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_record_beneficiary_claim(uuid,text,jsonb)','6c633d39a54a560c7ef83d7211371963','bea03c35848d066ede151dc262f9a910','p_request_id,p_authorized_by,p_acquisition',false,
         array[$body$    v_lookup := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by);
$body$,$body$    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by); -- Recheck current admin after unique-index waits.
$body$],
         array[$body$    v_lookup := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by);
    -- Later reader admission must not authorize this writer, including exact replay.
    -- Match053: retain a current-admin membership lock through transaction completion.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$,$body$    -- Recheck original scope after unique-index waits; the independent admin lock remains held.
    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by);
$body$]),
        ('public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)','6e0f5229a90b05306b377dccdb3067f3','f8011861c4b0ef1b19ec5e8e465c8f3a','p_request_id,p_authorized_by,p_observed_outcome,p_history_state',false,
         array[$body$    v_lookup := public.d1_load_refund_outcome(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_lookup := public.d1_load_refund_outcome(p_request_id, p_authorized_by);
    -- Independently gate exact replay, validation and new outcome evidence.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$]),
        ('public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text)','121ae4df245df2e858e662ad479ddaef','16dd1e20705025fc3714fbeb58836a78','p_request_id,p_authorized_by,p_signing_nonce,p_signed_xdr,p_transaction_hash',false,
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
$body$],
         array[$body$    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independently gate validation, signed-byte replay and new signed evidence.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
$body$])
    ) as expected(signature,live_digest,canonical_digest,args,private,anchors,replacements) loop
        select * into v_proc from pg_catalog.pg_proc
            where oid = pg_catalog.to_regprocedure(v_expected.signature);
        if not found then
            raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
        end if;
        if (v_proc.proowner = 'postgres'::regrole and v_proc.prorettype = 'jsonb'::regtype
            and v_proc.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
            and v_proc.prokind = 'f' and v_proc.provolatile = 'v' and v_proc.proparallel = 'u'
            and v_proc.prosecdef and not v_proc.proisstrict and not v_proc.proleakproof and not v_proc.proretset
            and v_proc.proconfig = array['search_path=""']
            and v_proc.proargnames = pg_catalog.string_to_array(v_expected.args,',')
            and v_proc.pronargs = pg_catalog.cardinality(v_proc.proargnames)
            and v_proc.pronargdefaults = 0 and v_proc.proargdefaults is null
            and v_proc.proallargtypes is null and v_proc.proargmodes is null
            and v_proc.probin is null and v_proc.prosqlbody is null
            and v_proc.procost = 100 and v_proc.prorows = 0 and v_proc.prosupport = 0
            and case when v_expected.private then
                pg_catalog.cardinality(v_proc.proacl) = 1
                and v_proc.proacl @> array['postgres=X/postgres']::aclitem[]
            else pg_catalog.cardinality(v_proc.proacl) = 2
                and v_proc.proacl @> array['postgres=X/postgres','service_role=X/postgres']::aclitem[] end) is not true then
            raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
        end if;
        v_body := v_proc.prosrc;
        -- Never rewrite an already canonical function, including its metadata.
        if pg_catalog.md5(v_body) = v_expected.canonical_digest then continue; end if;
        if pg_catalog.md5(v_body) <> v_expected.live_digest then
            raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
        end if;
        v_definition := pg_catalog.pg_get_functiondef(v_proc.oid);
        v_prefix := 'CREATE OR REPLACE FUNCTION ' || pg_catalog.split_part(v_expected.signature,'(',1) || '(';
        if pg_catalog.left(v_definition,pg_catalog.length(v_prefix)) <> v_prefix
           or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
           or pg_catalog.cardinality(v_expected.anchors) <> pg_catalog.cardinality(v_expected.replacements) then
            raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
        end if;
        v_new_body := v_body;
        for v_i in 1..pg_catalog.cardinality(v_expected.anchors) loop
            if pg_catalog.length(v_new_body) - pg_catalog.length(pg_catalog.replace(v_new_body,v_expected.anchors[v_i],''))
                    <> pg_catalog.length(v_expected.anchors[v_i]) then
                raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
            end if;
            v_new_body := pg_catalog.replace(v_new_body,v_expected.anchors[v_i],v_expected.replacements[v_i]);
        end loop;
        if pg_catalog.md5(v_new_body) <> v_expected.canonical_digest then
            raise exception 'unexpected_d1_pre_admission_definition' using errcode = 'P0001';
        end if;
        v_replacements := pg_catalog.array_append(v_replacements,pg_catalog.replace(v_definition,v_body,v_new_body));
    end loop;
    -- Validate every function before any DDL; preserve OIDs, owners, ACLs and comments.
    foreach v_definition in array v_replacements loop execute v_definition; end loop;
end;
$migration$;
commit;
