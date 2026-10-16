create or replace function public.browse_company_cache(p_query text default '',p_page int default 1,p_sort text default 'name',p_region text default '',p_legal_form text default '',p_employees text default '')
returns jsonb language sql stable set search_path=public as $$
 with filtered as (
   select c.*, coalesce(c.raw_data#>>'{ruz,region}','') region,
     coalesce(c.raw_data->>'employees','') employees,
     case when c.raw_data#>>'{data_quality,version}'='2' and jsonb_typeof(c.raw_data#>'{financials,revenue}')='number' then (c.raw_data#>>'{financials,revenue}')::numeric end revenue,
     case when c.raw_data->>'registration_date' ~ '^\d{4}-\d{2}-\d{2}$' then c.raw_data->>'registration_date' end creation_date
   from public.companies c where c.ico ~ '^[0-9]{8}$' and c.name not like 'Fyzická osoba - podnikateľ s IČO:%'
     and (p_query='' or strpos(lower(c.name),lower(p_query))>0 or c.ico=lpad(p_query,8,'0'))
     and (p_region='' or c.raw_data#>>'{ruz,unit,kraj}'=p_region or strpos(lower(coalesce(c.raw_data#>>'{ruz,region}','')),lower(p_region))>0)
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
