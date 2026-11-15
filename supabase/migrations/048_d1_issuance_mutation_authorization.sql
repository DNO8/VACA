-- Prerequisite only: independent current-admin gates, NOT refund service admission.
-- Pinned to retained014/20261011060218 + local015-034 (see accompanying doc).
-- Quiesce callers before any separately authorized application; replacement is atomic.
begin;
do $migration$
declare
    v_expected record;
    v_oid regprocedure;
    v_body text;
    v_definition text;
    v_header text;
    v_guard text;
    v_replacements text[] := array[]::text[];
begin
    -- MD5 pins the exact UTF-8 bytes between each original AS $$ / $$ delimiter,
    -- including leading/trailing newlines. These are source pins, not caller input.
    -- Validate ALL definitions and construct replacements before executing any DDL.
    for v_expected in select * from (values
        ('public.d1_save_unsigned_transaction(uuid,text,text,text)', 'e051f309ba6851e9bdccca2e46c9fa51',
         array['p_request_id','p_authorized_by','p_unsigned_xdr','p_transaction_hash'],
         '    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);'),
        ('public.d1_record_operating_credit(uuid,text,jsonb)', '68f0066f265cc60219c18a1a11a85689',
         array['p_namespace','p_authorized_by','p_observation'],
         '    v_lookup := public.d1_load_operating_credit(p_namespace, p_authorized_by, p_observation ->> ''operationId'');'),
        ('public.d1_record_issuance_fee_commitment(uuid,text,text,text)', 'ad157a2ffa47b56e5a921a586e736c18',
         array['p_request_id','p_authorized_by','p_issuance_fee_stroops','p_future_refund_fee_stroops'],
         '    v_lookup := public.d1_load_issuance_fee_commitments(p_request_id, p_authorized_by);'),
        ('public.d1_record_initial_financial_observation(uuid,text,jsonb)', '1f51a7347bea46bbc28dc3f32b652d59',
         array['p_request_id','p_authorized_by','p_snapshot'],
         '    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);'),
        ('public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb)', '4aef9f14f211297ac7b12a22f120b37f',
         array['p_request_id','p_authorized_by','p_snapshot'],
         '    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);'),
        ('public.d1_record_signed_transaction(uuid,text,text,text)', '658d0b0083f5cc21b5e97431c39794bb',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_signed_xdr'],
         '    v_signed := public.d1_load_signed_transaction(p_request_id, p_authorized_by);'),
        ('public.d1_claim_submission_attempt(uuid,text,text,uuid)', '27998162da52231076832e1df4d45535',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_attempt_id'],
         '    v_lookup := public.d1_load_submission_attempt(p_request_id, p_authorized_by);'),
        ('public.d1_record_issuance_outcome(uuid,text,jsonb)', 'ab0d1515cf9db92b6663c2ca570c2a15',
         array['p_request_id','p_authorized_by','p_observed_outcome'],
         '    v_lookup := public.d1_load_issuance_outcome(p_request_id, p_authorized_by);')
    ) as expected(signature, digest, args, anchor) loop
        -- NULL from a missing signature also takes the fail-closed contract.
        v_oid := pg_catalog.to_regprocedure(v_expected.signature);
        if not exists (select 1 from pg_catalog.pg_proc p where p.oid = v_oid
            and pg_catalog.md5(p.prosrc) = v_expected.digest
            and p.proowner = 'postgres'::regrole and p.prorettype = 'jsonb'::regtype
            and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
            and p.prokind = 'f' and p.provolatile = 'v' and p.proparallel = 'u'
            and p.prosecdef and not p.proisstrict and not p.proleakproof and not p.proretset
            and p.proconfig = array['search_path=""'] and p.proargnames = v_expected.args
            and p.pronargs = pg_catalog.cardinality(v_expected.args)
            and p.pronargdefaults = 0 and p.proargdefaults is null
            and p.proallargtypes is null and p.proargmodes is null
            and p.probin is null and p.prosqlbody is null
            and p.procost = 100 and p.prorows = 0 and p.prosupport = 0
            and pg_catalog.cardinality(p.proacl) = 2
            and p.proacl @> array['postgres=X/postgres','service_role=X/postgres']::aclitem[]) then
            raise exception 'unexpected_d1_issuance_guard_definition' using errcode = 'P0001';
        end if;
        select p.prosrc, pg_catalog.pg_get_functiondef(p.oid) into strict v_body, v_definition
            from pg_catalog.pg_proc p where p.oid = v_oid;
        v_header := 'CREATE OR REPLACE FUNCTION ' || pg_catalog.split_part(v_expected.signature, '(', 1) || '(';
        if pg_catalog.left(v_definition, pg_catalog.length(v_header)) <> v_header
           or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_body, '')) <> pg_catalog.length(v_body)
           or pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body, v_expected.anchor, '')) <> pg_catalog.length(v_expected.anchor) then
            raise exception 'unexpected_d1_issuance_guard_definition' using errcode = 'P0001';
        end if;
        -- Repeat ONLY the shared reader's original ID/key checks before membership.
        --018's earlier byte/hash shape checks remain ahead of this insertion.
        -- The original reader still derives scope and retains every subsequent lock.
        v_guard := pg_catalog.format($guard$
    -- Independent current membership: shared readers cannot authorize this write.
    if %I is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception %L using errcode = '22023';
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
$guard$, v_expected.args[1], case when v_expected.args[1] = 'p_namespace'
            then 'invalid_discovery_page' else 'invalid_unsigned_transaction' end);
        v_replacements := pg_catalog.array_append(v_replacements,
            pg_catalog.replace(v_definition, v_body,
                pg_catalog.replace(v_body, v_expected.anchor, v_guard || v_expected.anchor)));
    end loop;
    -- CREATE OR REPLACE preserves OIDs, ownership, ACLs and comments; copied
    -- headers retain signatures/config. No wrappers, grants or service identities.
    foreach v_definition in array v_replacements loop
        execute v_definition;
    end loop;
end;
$migration$;
commit;
