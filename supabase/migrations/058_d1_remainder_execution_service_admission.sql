-- SOURCE ONLY / UNVERIFIED: explicit configured049 remainder execution admission.
-- Requires canonical039-047 and effective048-057. No grants, enrollment or new RPC.
-- Quiesce callers before separately authorized application; never patch past drift.
begin;
do $migration$
declare
    v_expected record;
    v_change record;
    v_body text;
    v_new_body text;
    v_definition text;
    v_prefix text;
    v_gate text;
    v_replacement text;
    v_i integer;
    v_replacements text[] := array[]::text[];
    v_admin text := $admin$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$admin$;
    v_service text := $service$    -- Explicit058 admission, independent of any reader's permission.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        -- Reentrant049: pinned051 already holds membership, pool and preparation.
        -- Only saved-original scope from the pinned reader chain, NEVER snapshot fields.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (@scope@ ->> 'namespace')::uuid, @scope@ ->> 'pool');
    end if;$service$;
begin
    -- UTF-8 prosrc, including delimiter-adjacent newlines. MD5 is drift detection,
    -- not authentication.055/057 entries use their EFFECTIVE transformed pins.
    -- Include unchanged048 initial-write guards,051 scope discovery/recheck,
    --050/052/053 readers,055 v1 dependencies,039/040 and042/045/047 private helpers.
    for v_expected in select * from (values
        ('public.d1_load_unsigned_transaction(uuid,text)','4bdc190532a68f928c0042396df51067',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_save_unsigned_transaction(uuid,text,text,text)','9f5e5a2118aee63142f013d4f052b84d',
         'p_request_id,p_authorized_by,p_unsigned_xdr,p_transaction_hash','jsonb',false,null),
        ('public.d1_load_discovery_checkpoint(uuid,text)','76a637bf90b5f9f4e55382c36b4834e1',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_record_discovery_page(uuid,text,jsonb)','adc3805110c9add8fa9598498228f9dc',
         'p_namespace,p_authorized_by,p_page','jsonb',false,null),
        ('public.d1_load_discovery_state(uuid,text)','3c7883015d21b62ecb0f865f9221016d',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_load_operating_credit(uuid,text,text)','4ebd749d6bbdbabeb54e49c5b61254b4',
         'p_namespace,p_authorized_by,p_operation_id','jsonb',false,null),
        ('public.d1_record_operating_credit(uuid,text,jsonb)','3602e44ee2ca16741a079f69c83059a9',
         'p_namespace,p_authorized_by,p_observation','jsonb',false,null),
        ('public.d1_load_transaction_history_state(uuid,text)','c8d6710bb9a8c063238033c3a6ccbc96',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_record_transaction_page(uuid,text,jsonb)','50edd78755b46177f9c05364161b7b9b',
         'p_namespace,p_authorized_by,p_page','jsonb',false,null),
        ('public.d1_load_operating_credit_state(uuid,text)','7adfb5a54e897ef1baa0a1f079fb4ef6',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_load_issuance_fee_commitments(uuid,text)','1464f64aef92bd8cf3bf304a4238e373',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_issuance_fee_commitment(uuid,text,text,text)','f6892fbd1d1a15e2fec8f70337ada8fc',
         'p_request_id,p_authorized_by,p_issuance_fee_stroops,p_future_refund_fee_stroops','jsonb',false,null),
        ('public.d1_load_initial_financial_observation(uuid,text,text)','c3304178df56d11ea47c7a97f277d01c',
         'p_request_id,p_authorized_by,p_snapshot_hash','jsonb',false,null),
        ('public.d1_record_initial_financial_observation(uuid,text,jsonb)','f29ccb6548d2d2a3cff141217e0ff74e',
         'p_request_id,p_authorized_by,p_snapshot','jsonb',false,null),
        ('public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb)','829abeda89e2dfd20186c347a2d23756',
         'p_request_id,p_authorized_by,p_snapshot','jsonb',false,null),
        ('public.d1_load_signed_transaction(uuid,text)','72d89bf87d2ced0902ac91096436435a',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_signed_transaction(uuid,text,text,text)','14eb43448540eba5993c1c46df772dc0',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_signed_xdr','jsonb',false,null),
        ('public.d1_load_submission_attempt(uuid,text)','16705c173471af35905baef3cd17d5a5',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_claim_submission_attempt(uuid,text,text,uuid)','8d36e0228a7961d4508bebc238d87386',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_attempt_id','jsonb',false,null),
        ('public.d1_load_issuance_outcome(uuid,text)','e7f7afec83036c7add9e2adf119812b7',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_issuance_outcome(uuid,text,jsonb)','75ad1bd4604dbafd4db3921f563411b2',
         'p_request_id,p_authorized_by,p_observed_outcome','jsonb',false,null),
        ('public.d1_reserve_issuance_sequence(uuid,text,text)','a217d85a13fff68230a8472018396a0e',
         'p_request_id,p_authorized_by,p_observed_account_sequence','jsonb',false,null),
        ('public.d1_load_active_issuance_sequence(uuid,text)','8829a80f23adacfb98f422858f03c985',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_load_refund_candidate(uuid,text)','cce304248a8863cece127d329443c4f3',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_refund_candidate(uuid,text,text,text)','bd1b01421c6186b2d71a8d4ceef8e512',
         'p_request_id,p_authorized_by,p_unsigned_xdr,p_transaction_hash','jsonb',false,null),
        ('public.d1_load_refund_financial_observation(uuid,text,text)','9f2968308035fd02fca6aea854724cc4',
         'p_request_id,p_authorized_by,p_snapshot_hash','jsonb',false,null),
        ('public.d1_record_refund_financial_observation(uuid,text,jsonb)','47c4b8e86bf0cf3c645d5d8dc2ac6b80',
         'p_request_id,p_authorized_by,p_snapshot','jsonb',false,null),
        ('public.d1_load_refund_signing_journal(uuid,text)','b953d1047ecc484f17ef8f9a4ec5d641',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_claim_refund_signing(uuid,text,text,uuid)','d30c8f11897ffb6418ed89ccec831010',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_signing_nonce','jsonb',false,null),
        ('public.d1_record_signed_refund_transaction(uuid,text,uuid,text,text)','8524c2cb7788b6b6370f4c967b4730c7',
         'p_request_id,p_authorized_by,p_signing_nonce,p_signed_xdr,p_transaction_hash','jsonb',false,null),
        ('public.d1_load_refund_submission_attempt(uuid,text)','023f650da08dfcc90d125237c246b2dd',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_claim_refund_submission_attempt(uuid,text,text,uuid)','c04536d892f6e38dbabb7b6fe0479392',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_attempt_id','jsonb',false,null),
        ('public.d1_load_refund_outcome(uuid,text)','b5bb6609b6feb792c999056cad3ceb7c',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)','4c3a5dd4896c7c8ac3a574e3498fffdb',
         'p_request_id,p_authorized_by,p_observed_outcome,p_history_state','jsonb',false,null),
        ('public.d1_assert_refund_service_scope_private(text,uuid,text)','bbec1aadce4b0635983aec5f25c6e649',
         'p_actor,p_namespace,p_pool','void',true,null),
        ('public.d1_list_transaction_records(uuid,text,text,integer)','01670e28758aa0a472349c14a1a9f99a',
         'p_namespace,p_authorized_by,p_after,p_limit','jsonb',false,'''0''::text, 100'),
        ('public.d1_list_operating_credits(uuid,text,text,integer)','6bf9e6a47fbaee233696ffe53ad91a07',
         'p_namespace,p_authorized_by,p_after,p_limit','jsonb',false,'''0''::text, 100'),
        ('public.d1_load_beneficiary_claim(uuid,text)','c3150882cade14935c3afd8e7e2c1436',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_beneficiary_claim(uuid,text,jsonb)','12b182af3d84a050af63f82158d7b938',
         'p_request_id,p_authorized_by,p_acquisition','jsonb',false,null),
        ('public.d1_list_beneficiary_claim_set(uuid,text)','f5ff97177e59dfcadb7eaab6d463d9b4',
         'p_namespace,p_authorized_by','jsonb',false,null),
        ('public.d1_acquire_refund_lane_fence_private(uuid,uuid,text,text,text)','a94851b052a714967abfb20b14b122ab',
         'p_namespace,p_request_id,p_authorized_by,p_candidate_hash,p_lane','jsonb',true,null),
        ('public.d1_acquire_verified_remainder_fence_private(uuid,uuid,text,text)','212b610789b631301b9772d78d9c6804',
         'p_namespace,p_request_id,p_authorized_by,p_candidate_hash','jsonb',true,null),
        ('public.d1_load_refund_lane_fence(uuid,text)','e95d1b74de316aa3a940b5bc71130a9c',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_load_remainder_candidate(uuid,text)','cb330917740ec940b8de7731a6090bc2',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_remainder_candidate(uuid,text,text,text,text,text,text)','e302089690e6b1ba0dba6df4d229bfc4',
         'p_request_id,p_authorized_by,p_unsigned_xdr,p_transaction_hash,p_source_sequence,p_valid_until,p_claim_set_hash','jsonb',false,null),
        ('public.d1_remainder_membership_query_private(text,jsonb,uuid,uuid,text)','e5bd46cd5791da78ffc0d6cb2b6cb299',
         'p_name,p_args,p_request_id,p_namespace,p_actor','jsonb',true,null),
        ('public.d1_remainder_financial_membership_private(uuid,text,jsonb)','cd43e4d5503e7a4fb9233240c75bf40d',
         'p_request_id,p_authorized_by,p_snapshot','jsonb',true,null),
        ('public.d1_revalidate_remainder_financial_snapshot_private(uuid,text,jsonb)','d6115c1b33e310f894569b84911937e4',
         'p_request_id,p_authorized_by,p_snapshot','void',true,null),
        ('public.d1_load_remainder_financial_observation(uuid,text,text)','56b897e4859f368d7b1dbd03b559bac3',
         'p_request_id,p_authorized_by,p_snapshot_hash','jsonb',false,null),
        ('public.d1_record_remainder_financial_observation(uuid,text,jsonb)','6535edb0a581453ac28f2ffc1f6b837a',
         'p_request_id,p_authorized_by,p_snapshot','jsonb',false,null),
        ('public.d1_remainder_envelope_sha256_private(text)','c33f969e34038dff79fd48f0aabe4e25',
         'p_xdr','text',true,null),
        ('public.d1_remainder_fresh_evidence_private(uuid,text,text,jsonb)','5057bcb037ece108378216c7df1f7c7d',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_candidate','jsonb',true,null),
        ('public.d1_load_remainder_signing_journal(uuid,text)','f10302acb9edf396a893ea9fba088a84',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_claim_remainder_signing(uuid,text,text,uuid)','2432489aa5a7ca5a7ec8c5156c21da85',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_signing_nonce','jsonb',false,null),
        ('public.d1_record_signed_remainder(uuid,text,uuid,text,text,text)','ed3a1078855a8d0a241b03fb84584e60',
         'p_request_id,p_authorized_by,p_signing_nonce,p_snapshot_hash,p_signed_xdr,p_envelope_sha256','jsonb',false,null),
        ('public.d1_load_remainder_submission_attempt(uuid,text)','3d4b33ac125b078455bd39d9520f24c3',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_claim_remainder_submission_attempt(uuid,text,text,uuid)','a232ebe6e63a388f5a4c07bcedb5b1be',
         'p_request_id,p_authorized_by,p_snapshot_hash,p_attempt_nonce','jsonb',false,null),
        ('public.d1_remainder_outcome_receipt_private(jsonb,text,jsonb,jsonb,jsonb)','bc1207567cb06f3f40a0dc990e551622',
         's,actor,o,h,current_history','jsonb',true,null),
        ('public.d1_load_remainder_outcome(uuid,text)','fabde4ea21670fac030a96e70f35dbab',
         'p_request_id,p_authorized_by','jsonb',false,null),
        ('public.d1_record_remainder_outcome(uuid,text,jsonb,jsonb)','24e6d8976cdc52625ff54bd2951ccc34',
         'p_request_id,p_authorized_by,p_observed_outcome,p_history_state','jsonb',false,null)
    ) as expected(signature,digest,args,result,private,defaults) loop
        if not exists (select 1 from pg_catalog.pg_proc p
            where p.oid = pg_catalog.to_regprocedure(v_expected.signature)
            and pg_catalog.md5(p.prosrc) = v_expected.digest
            and p.proowner = 'postgres'::regrole and p.prorettype = v_expected.result::regtype
            and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
            and p.prokind = 'f' and p.provolatile = 'v' and p.proparallel = 'u'
            and p.prosecdef and not p.proisstrict and not p.proleakproof and not p.proretset
            and p.proconfig = array['search_path=""']
            and p.proargnames = pg_catalog.string_to_array(v_expected.args,',')
            and p.pronargs = pg_catalog.cardinality(p.proargnames)
            and p.pronargdefaults = case when v_expected.defaults is null then 0 else 2 end
            and case when v_expected.defaults is null then p.proargdefaults is null
                else pg_catalog.pg_get_expr(p.proargdefaults,0) = v_expected.defaults end
            and p.proallargtypes is null and p.proargmodes is null
            and p.probin is null and p.prosqlbody is null
            and p.procost = 100 and p.prorows = 0 and p.prosupport = 0
            and case when v_expected.private then
                pg_catalog.cardinality(p.proacl) = 1
                and p.proacl @> array['postgres=X/postgres']::aclitem[]
            else pg_catalog.cardinality(p.proacl) = 2
                and p.proacl @> array['postgres=X/postgres','service_role=X/postgres']::aclitem[] end) then
            raise exception 'unexpected_d1_remainder_service_definition' using errcode = 'P0001';
        end if;
    end loop;
    -- Twelve targets / thirteen contextual anchors. TRUE replaces the existing
    -- manual gate; FALSE inserts an independent writer gate after its reader,
    -- BEFORE replay/mutation. Neither mode removes validation or financial code.
    -- Every fallback is reentrant, never first membership acquisition after pool locks.
    for v_change in select * from (values
        ('public.d1_load_remainder_candidate(uuid,text)','eefb834f72415edb1b9d2c32e77401d6','s',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_candidate_lookup','revision',2,$anchor$],
         array[true]),
        ('public.d1_record_remainder_candidate(uuid,text,text,text,text,text,text)','60372fd76799f069a696ab09c1c9b373','lookup',
         array[$anchor$    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);$anchor$,
               $anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    now_seconds := extract(epoch from pg_catalog.clock_timestamp());$anchor$],
         array[false,true]),
        ('public.d1_revalidate_remainder_financial_snapshot_private(uuid,text,jsonb)','07fc868e534fda20cd3cebf5f4ee4b77','facts',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    final_now := extract(epoch from pg_catalog.clock_timestamp());$anchor$],
         array[true]),
        ('public.d1_load_remainder_financial_observation(uuid,text,text)','4f2ed0c409c413053ed768dbca591ac7','lookup',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_financial_observation_lookup','revision',2,$anchor$],
         array[true]),
        ('public.d1_record_remainder_financial_observation(uuid,text,jsonb)','3c467199c60837c48205e45d1d620fb5','lookup',
         array[$anchor$    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);$anchor$],
         array[false]),
        ('public.d1_load_remainder_signing_journal(uuid,text)','f28cb6d425ac126c67a2f47d46dae873','lookup',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    -- No043 here: expired historical bytes and ORIGINAL actors remain readable, not renewed.$anchor$],
         array[true]),
        ('public.d1_claim_remainder_signing(uuid,text,text,uuid)','6b3bebd47a01a77bfe13f55d7ac23e17','journal',
         array[$anchor$    journal := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by);$anchor$],
         array[false]),
        ('public.d1_record_signed_remainder(uuid,text,uuid,text,text,text)','6f6691c63753556385c4522ba509d177','journal',
         array[$anchor$    journal := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by);$anchor$],
         array[false]),
        ('public.d1_load_remainder_submission_attempt(uuid,text)','217203b2357e6bbfdf6656cd2477efea','journal',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    -- Historical B is NOT revalidated for freshness or relabeled with the requesting actor.$anchor$],
         array[true]),
        ('public.d1_claim_remainder_submission_attempt(uuid,text,text,uuid)','b359870f116cdf0a9e2f396b2ec74b6e','lookup',
         array[$anchor$    lookup := public.d1_load_remainder_submission_attempt(p_request_id,p_authorized_by);$anchor$],
         array[false]),
        ('public.d1_load_remainder_outcome(uuid,text)','e1f16d5db8e86e5ff386ecb3632d21ca','s',
         array[$anchor$    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_outcome_lookup','revision',2,'request_id',p_request_id,$anchor$],
         array[true]),
        ('public.d1_record_remainder_outcome(uuid,text,jsonb,jsonb)','2220064e577ca680e7a9a323ad99eada','lookup',
         array[$anchor$    lookup := public.d1_load_remainder_outcome(p_request_id,p_authorized_by);$anchor$],
         array[false])
    ) as changes(signature,digest,scope,anchors,replace_gate) loop
        select prosrc, pg_catalog.pg_get_functiondef(oid) into strict v_body, v_definition
            from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure(v_change.signature);
        v_prefix := 'CREATE OR REPLACE FUNCTION ' || pg_catalog.split_part(v_change.signature,'(',1) || '(';
        if pg_catalog.left(v_definition,pg_catalog.length(v_prefix)) <> v_prefix
           or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
           or pg_catalog.cardinality(v_change.anchors) <> pg_catalog.cardinality(v_change.replace_gate) then
            raise exception 'unexpected_d1_remainder_service_definition' using errcode = 'P0001';
        end if;
        v_new_body := v_body;
        v_gate := pg_catalog.replace(v_service,'@scope@',v_change.scope);
        for v_i in 1..pg_catalog.cardinality(v_change.anchors) loop
            if pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body,v_change.anchors[v_i],''))
                    <> pg_catalog.length(v_change.anchors[v_i])
               or pg_catalog.length(v_new_body) - pg_catalog.length(pg_catalog.replace(v_new_body,v_change.anchors[v_i],''))
                    <> pg_catalog.length(v_change.anchors[v_i]) then
                raise exception 'unexpected_d1_remainder_service_definition' using errcode = 'P0001';
            end if;
            if v_change.replace_gate[v_i] then
                if pg_catalog.length(v_change.anchors[v_i]) - pg_catalog.length(pg_catalog.replace(v_change.anchors[v_i],v_admin,''))
                        <> pg_catalog.length(v_admin) then
                    raise exception 'unexpected_d1_remainder_service_definition' using errcode = 'P0001';
                end if;
                v_replacement := pg_catalog.replace(v_change.anchors[v_i],v_admin,v_gate);
            else
                v_replacement := v_change.anchors[v_i] || E'\n' || v_gate;
            end if;
            v_new_body := pg_catalog.replace(v_new_body,v_change.anchors[v_i],v_replacement);
        end loop;
        if pg_catalog.md5(v_new_body) <> v_change.digest then
            raise exception 'unexpected_d1_remainder_service_definition' using errcode = 'P0001';
        end if;
        v_replacements := pg_catalog.array_append(v_replacements,
            pg_catalog.replace(v_definition,v_body,v_new_body));
    end loop;
    -- Construct ALL replacements before any DDL. Transaction rolls back on drift.
    -- Existing OIDs, owners, signatures, ACLs and comments remain; no data writes.
    foreach v_definition in array v_replacements loop
        execute v_definition;
    end loop;
end;
$migration$;
commit;
