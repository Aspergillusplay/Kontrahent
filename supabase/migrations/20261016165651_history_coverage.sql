create or replace function public.save_company_snapshot(p_snapshot jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare previous public.companies; saved public.companies; field text; change text; event uuid;
begin
  if coalesce(p_snapshot->>'ico','') !~ '^[0-9]{8}$' or coalesce(p_snapshot->>'name','')='' then raise exception 'Invalid company identity'; end if;
  perform pg_advisory_xact_lock(hashtext('company:'||(p_snapshot->>'ico')));
  select * into previous from public.companies where ico=p_snapshot->>'ico' for update;
  if previous.last_checked_at >= (p_snapshot->>'last_checked_at')::timestamptz then return to_jsonb(previous); end if;
  insert into public.companies(ico,name,legal_form,address,city,status,tax_debt,social_debt,health_debt,court_cases,is_bankrupt,is_in_liquidation,risk_score,risk_reasons,raw_data,last_checked_at)
  select ico,name,legal_form,address,city,status,tax_debt,social_debt,health_debt,court_cases,is_bankrupt,is_in_liquidation,risk_score,risk_reasons,raw_data,last_checked_at
  from jsonb_populate_record(null::public.companies,p_snapshot)
  on conflict(ico) do update set name=excluded.name,legal_form=excluded.legal_form,address=excluded.address,city=excluded.city,status=excluded.status,
    tax_debt=excluded.tax_debt,social_debt=excluded.social_debt,health_debt=excluded.health_debt,court_cases=excluded.court_cases,
    is_bankrupt=excluded.is_bankrupt,is_in_liquidation=excluded.is_in_liquidation,risk_score=excluded.risk_score,risk_reasons=excluded.risk_reasons,
    raw_data=excluded.raw_data,last_checked_at=excluded.last_checked_at returning * into saved;
  if previous.raw_data->'data_quality'->>'version'='2' then
    foreach field in array array['risk_score','tax_debt','social_debt','health_debt','status','is_bankrupt','is_in_liquidation'] loop
      if to_jsonb(previous)->field is distinct from to_jsonb(saved)->field then
        -- An outage or loss of coverage is not an improvement in financial health.
        if field like '%_debt' and (saved.raw_data#>>array['data_quality','debts',split_part(field,'_',1),'status']) is distinct from 'verified' then continue; end if;
        -- First coverage establishes a baseline; unknown does not mean zero.
        if field like '%_debt' and coalesce(previous.raw_data#>>array['data_quality','debts',split_part(field,'_',1),'status'],'') not in ('verified','stale') then continue; end if;
        if field in ('status','is_bankrupt','is_in_liquidation') and (previous.raw_data#>>'{data_quality,legal_status,status}' is distinct from 'verified' or saved.raw_data#>>'{data_quality,legal_status,status}' is distinct from 'verified') then continue; end if;
        if field='risk_score' and (previous.risk_score='unknown' or saved.risk_score='unknown' or
          previous.raw_data#>>'{data_quality,legal_status,status}' is distinct from saved.raw_data#>>'{data_quality,legal_status,status}' or
          previous.raw_data#>>'{data_quality,financials,status}' is distinct from saved.raw_data#>>'{data_quality,financials,status}' or
          (select array_agg(previous.raw_data#>>array['data_quality','debts',source,'status'] order by source) from unnest(array['tax','social','health']) source)
          is distinct from
          (select array_agg(saved.raw_data#>>array['data_quality','debts',source,'status'] order by source) from unnest(array['tax','social','health']) source)) then continue; end if;
        change := 'neutral';
        if field like '%_debt' then change:=case when (to_jsonb(saved)->>field)::numeric > (to_jsonb(previous)->>field)::numeric then 'worsened' else 'improved' end;
        elsif field in ('is_bankrupt','is_in_liquidation') then change:=case when (to_jsonb(saved)->>field)::boolean then 'worsened' else 'improved' end;
        elsif field='risk_score' and saved.risk_score<>'unknown' and previous.risk_score<>'unknown' then
          change:=case when array_position(array['green','yellow','red'],saved.risk_score)>array_position(array['green','yellow','red'],previous.risk_score) then 'worsened' else 'improved' end;
        end if;
        insert into public.company_history(ico,field_name,old_value,new_value,change_type,is_verified) values(saved.ico,field,to_jsonb(previous)->>field,to_jsonb(saved)->>field,change,true) returning id into event;
        insert into public.alerts(user_id,ico,company_name,message,severity,event_id)
        select w.user_id,saved.ico,saved.name,field||': '||coalesce(to_jsonb(previous)->>field,'—')||' → '||coalesce(to_jsonb(saved)->>field,'—'),
          case when change='worsened' then 'warning' else 'info' end,event
        from public.watchlists w where w.ico=saved.ico and w.created_at <= saved.last_checked_at
        on conflict(user_id,event_id) do nothing;
      end if;
    end loop;
  end if;
  return to_jsonb(saved);
end $$;
