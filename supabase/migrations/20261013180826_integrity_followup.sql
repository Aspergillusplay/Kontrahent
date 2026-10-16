-- Preserve invalid historical records for audit, but exclude them from the user history.
alter table public.company_history add column if not exists invalidated_at timestamptz;
alter table public.company_history add column if not exists invalidation_reason text;
alter table public.company_history add column if not exists is_verified boolean not null default false;
update public.company_history set invalidated_at=now(),invalidation_reason='Legacy scraper stored a missing value as text'
where invalidated_at is null and (old_value in ('undefined','NaN','[object Object]') or new_value in ('undefined','NaN','[object Object]'));
with duplicates as (
 select id,row_number() over(partition by ico,field_name,old_value,new_value,date_trunc('second',changed_at) order by changed_at,id) n
 from public.company_history where invalidated_at is null
) update public.company_history set invalidated_at=now(),invalidation_reason='Duplicate legacy change event'
where id in(select id from duplicates where n>1);
alter table public.job_leases add column if not exists cursor text not null default '';
alter function public.update_updated_at() set search_path='';
alter function public.compute_risk_score(numeric,numeric,numeric,integer,boolean,boolean) set search_path='';
create index if not exists history_visible_ico_date on public.company_history(ico,changed_at desc) where invalidated_at is null;
create index if not exists watchlists_ico_cursor on public.watchlists(ico);
create index if not exists alerts_pending on public.alerts(sent_at) where event_id is not null and (not telegram_delivered or not push_delivered);
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

create or replace function public.browse_company_cache(p_query text default '',p_page int default 1,p_sort text default 'name',p_region text default '',p_legal_form text default '',p_employees text default '')
returns jsonb language sql stable set search_path=public as $$
 with filtered as (
   select c.*, coalesce(c.raw_data#>>'{ruz,region}','') region,
     coalesce(c.raw_data->>'employees','') employees,
     case when c.raw_data#>>'{data_quality,version}'='2' and jsonb_typeof(c.raw_data#>'{financials,revenue}')='number' then (c.raw_data#>>'{financials,revenue}')::numeric end revenue,
     c.raw_data->>'registration_date' creation_date
   from public.companies c where c.ico ~ '^[0-9]{8}$'
     and (p_query='' or strpos(lower(c.name),lower(p_query))>0 or c.ico=lpad(p_query,8,'0'))
     and (p_region='' or strpos(lower(coalesce(c.raw_data#>>'{ruz,region}','')),lower(p_region))>0)
     and (p_legal_form='' or c.raw_data#>>'{ruz,unit,pravnaForma}'=p_legal_form)
     and (p_employees='' or c.raw_data#>>'{ruz,unit,velkostOrganizacie}'=p_employees)
 ), ordered as (
   select * from filtered order by
     case when p_sort='sales-desc' then revenue end desc nulls last,
     case when p_sort='sales' then revenue end asc nulls last,
     case when p_sort='creation-date-desc' then creation_date end desc nulls last,
     case when p_sort='city' then city when p_sort='region' then region when p_sort='ico' then ico else name end asc,
     ico asc limit 20 offset (greatest(1,least(p_page,5000))-1)*20
 ) select jsonb_build_object('companies',coalesce((select jsonb_agg(jsonb_build_object('ico',ico,'name',name,'city',city,'region',region,'employees',employees,'sales',case when revenue is null then '' else revenue::text||' EUR' end,'creation_date',creation_date,'source_url','https://www.registeruz.sk/cruz-public/domain/accountingentity/show/'||(raw_data#>>'{ruz,unit,id}'))) from ordered),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',p_page,'perPage',20,'totalPages',ceil((select count(*) from filtered)/20.0),'scope','indexed');
$$;
