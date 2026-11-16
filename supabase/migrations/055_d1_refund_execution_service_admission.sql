-- SOURCE ONLY / UNVERIFIED. Explicit refund execution and historical reconciliation.
-- No identity authentication, principal provisioning, grants or host activation.
-- Requires canonical018-038 and048-053;054 does not replace these functions.
-- Quiesce callers before separately authorized application. Drift aborts atomically.
begin;
do $migration$
declare
    v_expected record;
    v_change record;
    v_body text;
    v_new_body text;
    v_definition text;
    v_prefix text;
    v_i integer;
    v_replacements text[] := array[]::text[];
begin
    -- MD5 is a source-drift pin, not a security/consensus proof. Hash UTF-8 prosrc
    -- including delimiter-adjacent newlines. Derivation: canonical AS $$ bodies,
    -- then048 guard insertion and050/051/052/053 exact literal transformations.
    -- Pin EVERY target plus unchanged membership, initial-spend and evidence
    -- dependencies before constructing any replacement. No permissive fallback.
    for v_expected in select * from (values
        ('public.d1_load_unsigned_transaction(uuid,text)','4bdc190532a68f928c0042396df51067',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_save_unsigned_transaction(uuid,text,text,text)','9f5e5a2118aee63142f013d4f052b84d',
         array['p_request_id','p_authorized_by','p_unsigned_xdr','p_transaction_hash'],'jsonb',false),
        ('public.d1_load_discovery_checkpoint(uuid,text)','76a637bf90b5f9f4e55382c36b4834e1',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_record_discovery_page(uuid,text,jsonb)','adc3805110c9add8fa9598498228f9dc',
         array['p_namespace','p_authorized_by','p_page'],'jsonb',false),
        ('public.d1_load_discovery_state(uuid,text)','3c7883015d21b62ecb0f865f9221016d',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_operating_credit(uuid,text,text)','4ebd749d6bbdbabeb54e49c5b61254b4',
         array['p_namespace','p_authorized_by','p_operation_id'],'jsonb',false),
        ('public.d1_record_operating_credit(uuid,text,jsonb)','3602e44ee2ca16741a079f69c83059a9',
         array['p_namespace','p_authorized_by','p_observation'],'jsonb',false),
        ('public.d1_load_transaction_history_state(uuid,text)','c8d6710bb9a8c063238033c3a6ccbc96',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_record_transaction_page(uuid,text,jsonb)','50edd78755b46177f9c05364161b7b9b',
         array['p_namespace','p_authorized_by','p_page'],'jsonb',false),
        ('public.d1_load_operating_credit_state(uuid,text)','7adfb5a54e897ef1baa0a1f079fb4ef6',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_issuance_fee_commitments(uuid,text)','1464f64aef92bd8cf3bf304a4238e373',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_issuance_fee_commitment(uuid,text,text,text)','f6892fbd1d1a15e2fec8f70337ada8fc',
         array['p_request_id','p_authorized_by','p_issuance_fee_stroops','p_future_refund_fee_stroops'],'jsonb',false),
        ('public.d1_load_initial_financial_observation(uuid,text,text)','c3304178df56d11ea47c7a97f277d01c',
         array['p_request_id','p_authorized_by','p_snapshot_hash'],'jsonb',false),
        ('public.d1_record_initial_financial_observation(uuid,text,jsonb)','f29ccb6548d2d2a3cff141217e0ff74e',
         array['p_request_id','p_authorized_by','p_snapshot'],'jsonb',false),
        ('public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb)','829abeda89e2dfd20186c347a2d23756',
         array['p_request_id','p_authorized_by','p_snapshot'],'jsonb',false),
        ('public.d1_load_signed_transaction(uuid,text)','72d89bf87d2ced0902ac91096436435a',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_signed_transaction(uuid,text,text,text)','14eb43448540eba5993c1c46df772dc0',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_signed_xdr'],'jsonb',false),
        ('public.d1_load_submission_attempt(uuid,text)','16705c173471af35905baef3cd17d5a5',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_claim_submission_attempt(uuid,text,text,uuid)','8d36e0228a7961d4508bebc238d87386',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_attempt_id'],'jsonb',false),
        ('public.d1_load_issuance_outcome(uuid,text)','e7f7afec83036c7add9e2adf119812b7',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_issuance_outcome(uuid,text,jsonb)','f9a382ced4efac5af5ae176f08036cab',
         array['p_request_id','p_authorized_by','p_observed_outcome'],'jsonb',false),
        ('public.d1_reserve_issuance_sequence(uuid,text,text)','a217d85a13fff68230a8472018396a0e',
         array['p_request_id','p_authorized_by','p_observed_account_sequence'],'jsonb',false),
        ('public.d1_load_active_issuance_sequence(uuid,text)','8829a80f23adacfb98f422858f03c985',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_refund_candidate(uuid,text)','cce304248a8863cece127d329443c4f3',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_refund_candidate(uuid,text,text,text)','098923c1e32443956e24e2b322471b33',
         array['p_request_id','p_authorized_by','p_unsigned_xdr','p_transaction_hash'],'jsonb',false),
        ('public.d1_load_refund_financial_observation(uuid,text,text)','9f2968308035fd02fca6aea854724cc4',
         array['p_request_id','p_authorized_by','p_snapshot_hash'],'jsonb',false),
        ('public.d1_record_refund_financial_observation(uuid,text,jsonb)','3c581334af1d4ac1a4676ad23c3478b9',
         array['p_request_id','p_authorized_by','p_snapshot'],'jsonb',false),
        ('public.d1_load_refund_signing_journal(uuid,text)','b09c15a48e31e9907d2fb6b72ed0c144',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_claim_refund_signing(uuid,text,text,uuid)','5bd65aaa363a760c7ba61d55d7923632',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_signing_nonce'],'jsonb',false),
        ('public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text)','16dd1e20705025fc3714fbeb58836a78',
         array['p_request_id','p_authorized_by','p_signing_nonce','p_signed_xdr','p_transaction_hash'],'jsonb',false),
        ('public.d1_load_refund_submission_attempt(uuid,text)','4ef2c26f7bd81457d49ea9a7c8794589',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_claim_refund_submission_attempt(uuid,text,text,uuid)','fca48769781a83fba8c66385fcea2087',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_attempt_id'],'jsonb',false),
        ('public.d1_load_refund_outcome(uuid,text)','9ba439822aabe42a39048e37346638ae',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)','f8011861c4b0ef1b19ec5e8e465c8f3a',
         array['p_request_id','p_authorized_by','p_observed_outcome','p_history_state'],'jsonb',false),
        ('public.d1_assert_refund_service_scope_private(text,uuid,text)','bbec1aadce4b0635983aec5f25c6e649',
         array['p_actor','p_namespace','p_pool'],'void',true)
    ) as expected(signature,digest,args,result,private) loop
        if not exists (select 1 from pg_catalog.pg_proc p
            where p.oid = pg_catalog.to_regprocedure(v_expected.signature)
            and pg_catalog.md5(p.prosrc) = v_expected.digest
            and p.proowner = 'postgres'::regrole and p.prorettype = v_expected.result::regtype
            and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
            and p.prokind = 'f' and p.provolatile = 'v' and p.proparallel = 'u'
            and p.prosecdef and not p.proisstrict and not p.proleakproof and not p.proretset
            and p.proconfig = array['search_path=""'] and p.proargnames = v_expected.args
            and p.pronargs = pg_catalog.cardinality(v_expected.args)
            and p.pronargdefaults = 0 and p.proargdefaults is null
            and p.proallargtypes is null and p.proargmodes is null
            and p.probin is null and p.prosqlbody is null
            and p.procost = 100 and p.prorows = 0 and p.prosupport = 0
            and case when v_expected.private then
                pg_catalog.cardinality(p.proacl) = 1
                and p.proacl @> array['postgres=X/postgres']::aclitem[]
            else pg_catalog.cardinality(p.proacl) = 2
                and p.proacl @> array['postgres=X/postgres','service_role=X/postgres']::aclitem[] end) then
            raise exception 'unexpected_d1_refund_execution_service_definition' using errcode = 'P0001';
        end if;
    end loop;
    -- Only these ten existing RPCs change. Every anchor below must occur ONCE;
    -- candidate early053 and late034 gates have separate, contextual anchors.
    -- All refund fallbacks are reentrant049 checks after pinned051 admission,
    -- never first membership acquisition after pool/evidence locks.032 is the
    -- sole early gate and uses051 derivation + preparation recheck directly.
    for v_change in select * from (values
        ('public.d1_record_refund_candidate(uuid,text,text,text)','bd1b01421c6186b2d71a8d4ceef8e512',
         array[$anchor$    -- Independent authorization: reader admission must never authorize writer replay.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$,
            $anchor$    -- All dependent locks are held; recheck current membership and wall clock now.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    -- Independent authorization: reader admission must never authorize writer replay.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$,
            $replacement$    -- All dependent locks are held; recheck current membership and wall clock now.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$]),
        ('public.d1_record_refund_financial_observation(uuid,text,jsonb)','47c4b8e86bf0cf3c645d5d8dc2ac6b80',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$]),
        ('public.d1_load_refund_signing_journal(uuid,text)','b953d1047ecc484f17ef8f9a4ec5d641',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$]),
        ('public.d1_claim_refund_signing(uuid,text,text,uuid)','d30c8f11897ffb6418ed89ccec831010',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_journal ->> 'namespace')::uuid, v_journal ->> 'pool');
    end if;$replacement$]),
        ('public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text)','8524c2cb7788b6b6370f4c967b4730c7',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_journal ->> 'namespace')::uuid, v_journal ->> 'pool');
    end if;$replacement$]),
        ('public.d1_load_refund_submission_attempt(uuid,text)','023f650da08dfcc90d125237c246b2dd',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_journal ->> 'namespace')::uuid, v_journal ->> 'pool');
    end if;$replacement$]),
        ('public.d1_claim_refund_submission_attempt(uuid,text,text,uuid)','c04536d892f6e38dbabb7b6fe0479392',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$]),
        ('public.d1_load_refund_outcome(uuid,text)','b5bb6609b6feb792c999056cad3ceb7c',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_scope ->> 'namespace')::uuid, v_scope ->> 'pool');
    end if;$replacement$]),
        ('public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)','4c3a5dd4896c7c8ac3a574e3498fffdb',
         array[$anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$],
         array[$replacement$    if not found then
        -- Revalidation only: pinned051 already locked membership, pool and preparation.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$]),
        ('public.d1_record_issuance_outcome(uuid,text,jsonb)','75ad1bd4604dbafd4db3921f563411b2',
         array[$anchor$        raise exception 'unauthorized_admin_wallet' using errcode = '42501';$anchor$],
         array[$replacement$        -- Historical included-result evidence ONLY; no initial-spend authority.
        declare v_pool public.d1_pools%rowtype;
        begin
            -- Discover only: no preparation lock before membership and pool locks.
            select p.* into v_pool from public.d1_preparations r
                join public.d1_pools p on p.namespace = r.namespace
                where r.request_id = p_request_id;
            perform public.d1_assert_refund_service_scope_private(p_authorized_by, v_pool.namespace, v_pool.pool);
            -- A trusted-owner move/deletion during either lock wait must not redirect scope.
            -- Stabilize both request and admitted namespace before original rediscovery.
            perform 1 from public.d1_preparations
                where request_id = p_request_id and namespace = v_pool.namespace for share;
            if not found then
                raise exception 'unauthorized_admin_wallet' using errcode = '42501';
            end if;
        end;$replacement$])
    ) as changes(signature,digest,anchors,replacements) loop
        select prosrc, pg_catalog.pg_get_functiondef(oid) into strict v_body, v_definition
            from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure(v_change.signature);
        v_prefix := 'CREATE OR REPLACE FUNCTION ' || pg_catalog.split_part(v_change.signature,'(',1) || '(';
        if pg_catalog.left(v_definition,pg_catalog.length(v_prefix)) <> v_prefix
           or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
           or pg_catalog.cardinality(v_change.anchors) <> pg_catalog.cardinality(v_change.replacements) then
            raise exception 'unexpected_d1_refund_execution_service_definition' using errcode = 'P0001';
        end if;
        v_new_body := v_body;
        for v_i in 1..pg_catalog.cardinality(v_change.anchors) loop
            if pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body,v_change.anchors[v_i],''))
                    <> pg_catalog.length(v_change.anchors[v_i])
               or pg_catalog.length(v_new_body) - pg_catalog.length(pg_catalog.replace(v_new_body,v_change.anchors[v_i],''))
                    <> pg_catalog.length(v_change.anchors[v_i]) then
                raise exception 'unexpected_d1_refund_execution_service_definition' using errcode = 'P0001';
            end if;
            v_new_body := pg_catalog.replace(v_new_body,v_change.anchors[v_i],v_change.replacements[v_i]);
        end loop;
        if pg_catalog.md5(v_new_body) <> v_change.digest then
            raise exception 'unexpected_d1_refund_execution_service_definition' using errcode = 'P0001';
        end if;
        v_replacements := pg_catalog.array_append(v_replacements,
            pg_catalog.replace(v_definition,v_body,v_new_body));
    end loop;
    -- No DDL until ALL body/metadata/ACL/unique-anchor/post-body checks succeed.
    -- CREATE OR REPLACE retains OIDs, signatures, owners, ACLs and comments.
    -- No helper, new RPC, table write, purpose flag or broad admin substitution.
    foreach v_definition in array v_replacements loop
        execute v_definition;
    end loop;
end;
$migration$;
commit;
