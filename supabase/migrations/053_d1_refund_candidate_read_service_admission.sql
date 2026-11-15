-- Historical candidate reads only. Keep all candidate writer paths administrative.
-- Requires exact local015-034 +048-052. No grants, provisioning or financial authority.
-- Quiesce callers before separately authorized application; fail closed on schema drift.
begin;
do $migration$
declare
    v_expected record;
    v_body text;
    v_definition text;
    v_change record;
begin
    -- Pin post048 guards and remaining033/034 candidate gates before widening reads.
    -- Services receive evidence access, never implicit mutation/ownership authority.
    for v_expected in select * from (values
        ('public.d1_save_unsigned_transaction(uuid,text,text,text)','9f5e5a2118aee63142f013d4f052b84d',
         array['p_request_id','p_authorized_by','p_unsigned_xdr','p_transaction_hash'],'jsonb',false),
        ('public.d1_record_operating_credit(uuid,text,jsonb)','3602e44ee2ca16741a079f69c83059a9',
         array['p_namespace','p_authorized_by','p_observation'],'jsonb',false),
        ('public.d1_record_issuance_fee_commitment(uuid,text,text,text)','f6892fbd1d1a15e2fec8f70337ada8fc',
         array['p_request_id','p_authorized_by','p_issuance_fee_stroops','p_future_refund_fee_stroops'],'jsonb',false),
        ('public.d1_record_initial_financial_observation(uuid,text,jsonb)','f29ccb6548d2d2a3cff141217e0ff74e',
         array['p_request_id','p_authorized_by','p_snapshot'],'jsonb',false),
        ('public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb)','829abeda89e2dfd20186c347a2d23756',
         array['p_request_id','p_authorized_by','p_snapshot'],'jsonb',false),
        ('public.d1_record_signed_transaction(uuid,text,text,text)','14eb43448540eba5993c1c46df772dc0',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_signed_xdr'],'jsonb',false),
        ('public.d1_claim_submission_attempt(uuid,text,text,uuid)','8d36e0228a7961d4508bebc238d87386',
         array['p_request_id','p_authorized_by','p_snapshot_hash','p_attempt_id'],'jsonb',false),
        ('public.d1_record_issuance_outcome(uuid,text,jsonb)','f9a382ced4efac5af5ae176f08036cab',
         array['p_request_id','p_authorized_by','p_observed_outcome'],'jsonb',false),
        ('public.d1_assert_refund_service_scope_private(text,uuid,text)','bbec1aadce4b0635983aec5f25c6e649',
         array['p_actor','p_namespace','p_pool'],'void',true),
        ('public.d1_reserve_issuance_sequence(uuid,text,text)','a217d85a13fff68230a8472018396a0e',
         array['p_request_id','p_authorized_by','p_observed_account_sequence'],'jsonb',false),
        ('public.d1_load_active_issuance_sequence(uuid,text)','8829a80f23adacfb98f422858f03c985',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_unsigned_transaction(uuid,text)','4bdc190532a68f928c0042396df51067',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_signed_transaction(uuid,text)','72d89bf87d2ced0902ac91096436435a',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_submission_attempt(uuid,text)','16705c173471af35905baef3cd17d5a5',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_issuance_outcome(uuid,text)','e7f7afec83036c7add9e2adf119812b7',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_refund_candidate(uuid,text)','485206cc2847d1d820fb9435ed99a584',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_refund_candidate(uuid,text,text,text)','92436dc9398819cead547220956edfc3',
         array['p_request_id','p_authorized_by','p_unsigned_xdr','p_transaction_hash'],'jsonb',false)
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
            raise exception 'unexpected_d1_candidate_read_service_definition' using errcode = 'P0001';
        end if;
    end loop;
    -- Both replacements follow one complete preflight, in the same transaction.
    -- The writer gate precedes validation and exact replay, not merely INSERT.
    for v_change in select * from (values
        ('public.d1_record_refund_candidate(uuid,text,text,text)',
         'CREATE OR REPLACE FUNCTION public.d1_record_refund_candidate(',
         $anchor$    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);$anchor$,
         $replacement$    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    -- Independent authorization: reader admission must never authorize writer replay.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$replacement$),
        ('public.d1_load_refund_candidate(uuid,text)',
         'CREATE OR REPLACE FUNCTION public.d1_load_refund_candidate(',
         $anchor$    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$,
         $replacement$    if not found then
        -- Pinned051 already admitted and locked this original request scope before
        -- pool/evidence locks. This is revalidation, never first-time admission.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_scope ->> 'namespace')::uuid, v_scope ->> 'pool');
    end if;$replacement$)
    ) as changes(signature,prefix,anchor,replacement) loop
        select prosrc, pg_catalog.pg_get_functiondef(oid) into strict v_body, v_definition
            from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure(v_change.signature);
        if pg_catalog.left(v_definition, pg_catalog.length(v_change.prefix)) <> v_change.prefix
           or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
           or pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body,v_change.anchor,'')) <> pg_catalog.length(v_change.anchor) then
            raise exception 'unexpected_d1_candidate_read_service_definition' using errcode = 'P0001';
        end if;
        -- Preserve signatures, ACLs, comments and all unrelated original behavior.
        execute pg_catalog.replace(v_definition,v_body,pg_catalog.replace(v_body,v_change.anchor,v_change.replacement));
    end loop;
end;
$migration$;
commit;
