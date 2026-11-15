-- Scoped observation admission, not identity authentication or financial execution.
-- Requires exact local015-034 + independent048 guards +049. No grants or provisioning.
-- Quiesce callers before separately authorized application; fail closed on schema drift.
begin;
do $migration$
declare
    v_expected record;
    v_body text;
    v_definition text;
    v_anchor text := $old$        raise exception 'unauthorized_admin_wallet' using errcode = '42501';$old$;
    v_service text := $new$        -- Derive without locking; private assertion locks membership before pool.
        select * into v_pool from public.d1_pools where namespace = p_namespace;
        perform public.d1_assert_refund_service_scope_private(p_authorized_by, p_namespace, v_pool.pool);$new$;
begin
    -- Source-derived post048 digests include the independent guards. Checking only
    -- the reader would silently admit inherited writers when048 was missing.
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
        ('public.d1_load_discovery_checkpoint(uuid,text)','829e7f8f30d638a81aa20f822abd5758',
         array['p_namespace','p_authorized_by'],'jsonb',false),
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
            raise exception 'unexpected_d1_discovery_service_definition' using errcode = 'P0001';
        end if;
    end loop;
    select prosrc, pg_catalog.pg_get_functiondef(oid) into strict v_body, v_definition
        from pg_catalog.pg_proc where oid = 'public.d1_load_discovery_checkpoint(uuid,text)'::regprocedure;
    if pg_catalog.left(v_definition, pg_catalog.length('CREATE OR REPLACE FUNCTION public.d1_load_discovery_checkpoint('))
            <> 'CREATE OR REPLACE FUNCTION public.d1_load_discovery_checkpoint('
       or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
       or pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body,v_anchor,'')) <> pg_catalog.length(v_anchor) then
        raise exception 'unexpected_d1_discovery_service_definition' using errcode = 'P0001';
    end if;
    -- Preserve original admin branch, validation, locks, JSON, OID, ACL and comments.
    execute pg_catalog.replace(v_definition,v_body,pg_catalog.replace(v_body,v_anchor,v_service));
end;
$migration$;
commit;
