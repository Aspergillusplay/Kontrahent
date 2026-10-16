-- Additive migration. Existing company/user/history records are preserved.
alter table public.companies drop constraint if exists companies_risk_score_check;
alter table public.companies add constraint companies_risk_score_check check (risk_score in ('green','yellow','red','unknown'));
alter table public.companies alter column risk_score set default 'unknown';

create table if not exists public.debt_snapshot_rows (
  source text not null check (source in ('tax','social')),
  snapshot_id uuid not null,
  ico text not null check (ico ~ '^[0-9]{8}$'),
  name text,
  amount numeric(15,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  primary key (source,snapshot_id,ico)
);
create table if not exists public.debt_sync_state (
  source text primary key check (source in ('tax','social')),
  snapshot_id uuid not null,
  records_count integer not null,
  checked_at timestamptz not null
);
create table if not exists public.job_leases (
  name text primary key,
  owner uuid not null,
  expires_at timestamptz not null,
  completed_at timestamptz
);
alter table public.debt_snapshot_rows enable row level security;
alter table public.debt_sync_state enable row level security;
alter table public.job_leases enable row level security;
grant all on public.debt_snapshot_rows, public.debt_sync_state, public.job_leases to service_role;
revoke all on public.debt_snapshot_rows, public.debt_sync_state, public.job_leases from anon, authenticated;

alter table public.alerts add column if not exists event_id uuid references public.company_history(id);
alter table public.alerts add column if not exists telegram_delivered boolean not null default false;
alter table public.alerts add column if not exists push_delivered boolean not null default false;
create unique index if not exists alerts_user_event on public.alerts(user_id,event_id);

create or replace function public.claim_job(p_name text, p_owner uuid, p_seconds int default 900)
returns boolean language plpgsql set search_path = public as $$
begin
  insert into public.job_leases(name,owner,expires_at) values(p_name,p_owner,now()+make_interval(secs=>least(p_seconds,3600)))
  on conflict(name) do update set owner=excluded.owner, expires_at=excluded.expires_at
  where job_leases.expires_at < now();
  return found;
end $$;
create or replace function public.finish_job(p_name text,p_owner uuid,p_success boolean)
returns void language sql set search_path = public as $$
  update public.job_leases set expires_at=now(), completed_at=case when p_success then now() else completed_at end
  where name=p_name and owner=p_owner;
$$;

create or replace function public.publish_debt_snapshot(p_source text,p_snapshot uuid,p_count int,p_checked_at timestamptz)
returns void language plpgsql set search_path = public as $$
declare actual int;
begin
  perform pg_advisory_xact_lock(hashtext('debt:'||p_source));
  select count(*) into actual from public.debt_snapshot_rows where source=p_source and snapshot_id=p_snapshot;
  if p_count <= 0 or actual <> p_count then raise exception 'Incomplete debtor snapshot'; end if;
  if exists(select 1 from public.debt_sync_state where source=p_source and checked_at >= p_checked_at) then
    raise exception 'A newer snapshot is already published';
  end if;
  insert into public.debt_sync_state values(p_source,p_snapshot,actual,p_checked_at)
  on conflict(source) do update set snapshot_id=excluded.snapshot_id,records_count=excluded.records_count,checked_at=excluded.checked_at;
  insert into public.sync_log(source,records_count,status,synced_at) values(p_source,actual,'success',p_checked_at);
  -- Publication and removal are atomic for readers. Never remove another in-progress upload.
  delete from public.debt_snapshot_rows where source=p_source and snapshot_id<>p_snapshot and created_at < p_checked_at;
end $$;

create or replace function public.company_debt_snapshot(p_ico text)
returns table(source text,amount numeric,checked_at timestamptz) language sql stable set search_path = public as $$
  select s.source,coalesce(r.amount,0),s.checked_at from public.debt_sync_state s
  left join public.debt_snapshot_rows r on r.source=s.source and r.snapshot_id=s.snapshot_id and r.ico=p_ico;
$$;

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
        insert into public.company_history(ico,field_name,old_value,new_value,change_type) values(saved.ico,field,to_jsonb(previous)->>field,to_jsonb(saved)->>field,change) returning id into event;
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
     case when jsonb_typeof(c.raw_data#>'{financials,revenue}')='number' then (c.raw_data#>>'{financials,revenue}')::numeric end revenue,
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

revoke all on function public.claim_job(text,uuid,int),public.finish_job(text,uuid,boolean),public.publish_debt_snapshot(text,uuid,int,timestamptz),public.company_debt_snapshot(text),public.save_company_snapshot(jsonb),public.browse_company_cache(text,int,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_job(text,uuid,int),public.finish_job(text,uuid,boolean),public.publish_debt_snapshot(text,uuid,int,timestamptz),public.company_debt_snapshot(text),public.save_company_snapshot(jsonb),public.browse_company_cache(text,int,text,text,text,text) to service_role;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),new.raw_user_meta_data->>'full_name') on conflict(id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
-- Restore profiles for existing auth accounts without changing their preferences.
insert into public.profiles(id,email,full_name) select id,coalesce(email,''),raw_user_meta_data->>'full_name' from auth.users on conflict(id) do nothing;
