-- SOURCE ONLY / UNVERIFIED: explicit scoped beneficiary-evidence recording.
-- No SDK verification, financial authority, grants, enrollment or endpoint activation.
-- Requires exact039 and049-051 read admissions;055/056 remain unchanged.
-- Quiesce callers before separately authorized application. Never patch past drift.
begin;
do $migration$
declare
    v_expected record;
    v_body text;
    v_definition text;
    v_new_body text;
    v_prefix text := 'CREATE OR REPLACE FUNCTION public.d1_record_beneficiary_claim(';
    v_anchor text := $anchor$    -- Later reader admission must not authorize this writer, including exact replay.
    -- Match053: retain a current-admin membership lock through transaction completion.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;$anchor$;
    v_replacement text := $replacement$    -- Explicit057 writer admission, independent of inherited reader admission.
    -- Preserve the real manual administrator path, including its membership lock.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        -- Reentrant: pinned051 already holds membership, pool and original locks.
        -- Scope is derived from the authenticated original, never caller input.
        perform public.d1_assert_refund_service_scope_private(
            p_authorized_by, (v_lookup ->> 'namespace')::uuid, v_lookup ->> 'pool');
    end if;$replacement$;
begin
    -- Exact UTF-8 prosrc pins: unchanged reader chain from055's source manifest,
    -- and exact adopted039 delimiter-adjacent bodies. MD5 detects source drift;
    -- it is not authentication or a cryptographic evidence-validity claim.
    for v_expected in select * from (values
        ('public.d1_load_unsigned_transaction(uuid,text)','4bdc190532a68f928c0042396df51067',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_discovery_checkpoint(uuid,text)','76a637bf90b5f9f4e55382c36b4834e1',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_discovery_state(uuid,text)','3c7883015d21b62ecb0f865f9221016d',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_transaction_history_state(uuid,text)','c8d6710bb9a8c063238033c3a6ccbc96',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_operating_credit_state(uuid,text)','7adfb5a54e897ef1baa0a1f079fb4ef6',
         array['p_namespace','p_authorized_by'],'jsonb',false),
        ('public.d1_load_issuance_fee_commitments(uuid,text)','1464f64aef92bd8cf3bf304a4238e373',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_initial_financial_observation(uuid,text,text)','c3304178df56d11ea47c7a97f277d01c',
         array['p_request_id','p_authorized_by','p_snapshot_hash'],'jsonb',false),
        ('public.d1_load_signed_transaction(uuid,text)','72d89bf87d2ced0902ac91096436435a',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_submission_attempt(uuid,text)','16705c173471af35905baef3cd17d5a5',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_load_issuance_outcome(uuid,text)','e7f7afec83036c7add9e2adf119812b7',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_assert_refund_service_scope_private(text,uuid,text)','bbec1aadce4b0635983aec5f25c6e649',
         array['p_actor','p_namespace','p_pool'],'void',true),
        ('public.d1_load_beneficiary_claim(uuid,text)','c3150882cade14935c3afd8e7e2c1436',
         array['p_request_id','p_authorized_by'],'jsonb',false),
        ('public.d1_record_beneficiary_claim(uuid,text,jsonb)','bea03c35848d066ede151dc262f9a910',
         array['p_request_id','p_authorized_by','p_acquisition'],'jsonb',false)
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
            raise exception 'unexpected_d1_beneficiary_service_definition' using errcode = 'P0001';
        end if;
    end loop;
    select prosrc, pg_catalog.pg_get_functiondef(oid) into strict v_body, v_definition
        from pg_catalog.pg_proc
        where oid = 'public.d1_record_beneficiary_claim(uuid,text,jsonb)'::regprocedure;
    if pg_catalog.left(v_definition,pg_catalog.length(v_prefix)) <> v_prefix
       or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition,v_body,'')) <> pg_catalog.length(v_body)
       or pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body,v_anchor,'')) <> pg_catalog.length(v_anchor) then
        raise exception 'unexpected_d1_beneficiary_service_definition' using errcode = 'P0001';
    end if;
    v_new_body := pg_catalog.replace(v_body,v_anchor,v_replacement);
    if pg_catalog.md5(v_new_body) <> '12b182af3d84a050af63f82158d7b938' then
        raise exception 'unexpected_d1_beneficiary_service_definition' using errcode = 'P0001';
    end if;
    -- Only this existing RPC changes, after every metadata/ACL/body/anchor pin.
    -- Preserve signature, OID, owner, ACLs, validation and immutable exact replay.
    execute pg_catalog.replace(v_definition,v_body,v_new_body);
end;
$migration$;
commit;
