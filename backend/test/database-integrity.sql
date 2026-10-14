-- Run against the migrated schema. All fixtures and changes roll back.
begin;
do $$
declare
  company_ico text;
  snapshot jsonb;
  old_stamp timestamptz := now()-interval '1 hour';
  lease_owner uuid := gen_random_uuid();
  snap_a uuid := gen_random_uuid();
  snap_b uuid := gen_random_uuid();
  amount numeric;
  rows_before int;
  browse jsonb;
begin
  -- Derive an unused fixture identifier; never overwrite an existing company.
  select lpad(n::text,8,'0') into company_ico from generate_series(99999999,99999000,-1) n
    where not exists(select 1 from public.companies where ico=lpad(n::text,8,'0')) limit 1;
  if company_ico is null then raise exception 'No unused fixture ICO'; end if;
  snapshot:=jsonb_build_object('ico',company_ico,'name','__integrity_fixture__','tax_debt',100,'social_debt',0,'health_debt',0,
    'risk_score','unknown','risk_reasons','[]'::jsonb,'last_checked_at',old_stamp,
    'raw_data','{"data_quality":{"version":2,"debts":{"tax":{"status":"verified"}}},"financials":{"revenue":100}}'::jsonb);
  perform public.save_company_snapshot(snapshot);
  snapshot:=snapshot||jsonb_build_object('tax_debt',0,'last_checked_at',old_stamp+interval '1 minute');
  perform public.save_company_snapshot(snapshot);
  perform public.save_company_snapshot(snapshot);
  if (select tax_debt from public.companies where ico=company_ico)<>0 then raise exception 'Repaid debt persisted'; end if;
  if (select count(*) from public.company_history where ico=company_ico and field_name='tax_debt')<>1 then raise exception 'Duplicate change history'; end if;
  if (select change_type from public.company_history where ico=company_ico and field_name='tax_debt')<>'improved' then raise exception 'Debt reduction is not an improvement'; end if;
  perform public.save_company_snapshot(snapshot||jsonb_build_object('tax_debt',999,'last_checked_at',old_stamp));
  if (select tax_debt from public.companies where ico=company_ico)<>0 then raise exception 'Older request overwrote newer data'; end if;
  browse:=public.browse_company_cache('__integrity_fixture__',1,'sales-desc','','','');
  if (browse->>'total')::int<>1 or jsonb_array_length(browse->'companies')<>1 then raise exception 'Filtered total disagrees with results'; end if;
  if (public.browse_company_cache('__integrity_fixture__',1,'name','nonexistent region','','')->>'total')::int<>0 then raise exception 'Filter applied after pagination'; end if;
  insert into public.debt_snapshot_rows(source,snapshot_id,ico,amount) values('social',snap_a,company_ico,500);
  perform public.publish_debt_snapshot('social',snap_a,1,now()+interval '1 minute');
  begin
    perform public.publish_debt_snapshot('social',snap_b,2,now()+interval '2 minutes');
    raise exception 'Incomplete snapshot accepted';
  exception when others then
    if sqlerrm<>'Incomplete debtor snapshot' then raise; end if;
  end;
  select d.amount into amount from public.company_debt_snapshot(company_ico) d where source='social';
  if amount<>500 then raise exception 'Failed publication damaged previous snapshot'; end if;
  insert into public.debt_snapshot_rows(source,snapshot_id,ico,amount) values('social',snap_b,company_ico,0);
  perform public.publish_debt_snapshot('social',snap_b,1,now()+interval '2 minutes');
  select d.amount into amount from public.company_debt_snapshot(company_ico) d where source='social';
  if amount<>0 then raise exception 'Published zero did not clear debt'; end if;
  if not public.claim_job('__integrity_fixture__',lease_owner,60) then raise exception 'Initial job claim failed'; end if;
  if public.claim_job('__integrity_fixture__',gen_random_uuid(),60) then raise exception 'Concurrent job claim succeeded'; end if;
  if has_function_privilege('anon','public.save_company_snapshot(jsonb)','EXECUTE') then raise exception 'Anonymous snapshot writes allowed'; end if;
  if has_function_privilege('authenticated','public.publish_debt_snapshot(text,uuid,integer,timestamp with time zone)','EXECUTE') then raise exception 'User can publish debt snapshots'; end if;
end $$;
rollback;
select 'All database integrity checks passed; fixtures rolled back' as result;
