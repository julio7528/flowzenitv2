alter table public.demandas
  add column status text not null default 'Backlog';

alter table public.demandas
  add constraint demandas_status_por_tipo_check
  check (
    (tipo = 3 and status in ('Backlog', 'Analise', 'Executando', 'Aguardando', 'Done'))
    or (tipo in (1, 2) and status in ('Backlog', 'Em andamento', 'Done'))
  );

create or replace function public.status_calculado_demandas(
  p_parent_id bigint,
  p_child_tipo smallint
)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when count(*) = 0 or bool_and(child.status = 'Backlog') then 'Backlog'
    when bool_and(child.status = 'Done') then 'Done'
    else 'Em andamento'
  end
  from public.demandas as child
  where child.raizid = p_parent_id
    and child.tipo = p_child_tipo;
$function$;

update public.demandas as task
set status = public.status_calculado_demandas(task.id, 3::smallint)
where task.tipo = 2;

update public.demandas as demand
set status = public.status_calculado_demandas(demand.id, 2::smallint)
where demand.tipo = 1;

create or replace function public.bloquear_status_manual_pais_demandas()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.tipo in (1, 2) and pg_trigger_depth() = 1 then
    if tg_op = 'INSERT' and new.status <> 'Backlog' then
      raise exception 'Status de demanda e tarefa e calculado pelas subtarefas.'
        using errcode = '23514';
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'Status de demanda e tarefa e calculado pelas subtarefas.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

create trigger demandas_bloquear_status_manual_pais
before insert or update of status on public.demandas
for each row execute function public.bloquear_status_manual_pais_demandas();

create or replace function public.recalcular_status_pai_demandas(
  p_parent_id bigint,
  p_child_tipo smallint
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_parent_tipo smallint;
  v_status text;
begin
  if p_parent_id is null or p_child_tipo not in (2, 3) then
    return;
  end if;

  v_parent_tipo := p_child_tipo - 1;

  perform 1
  from public.demandas as parent
  where parent.id = p_parent_id
    and parent.tipo = v_parent_tipo
  for update;

  if not found then
    return;
  end if;

  v_status := public.status_calculado_demandas(p_parent_id, p_child_tipo);

  update public.demandas as parent
  set status = v_status
  where parent.id = p_parent_id
    and parent.tipo = v_parent_tipo
    and parent.status is distinct from v_status;
end;
$function$;

create or replace function public.propagar_status_hierarquia_demandas()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old_parent_id bigint;
  v_old_tipo smallint;
  v_new_parent_id bigint;
  v_new_tipo smallint;
begin
  if tg_op <> 'INSERT' then
    v_old_parent_id := old.raizid;
    v_old_tipo := old.tipo;
  end if;

  if tg_op <> 'DELETE' then
    v_new_parent_id := new.raizid;
    v_new_tipo := new.tipo;
  end if;

  if tg_op = 'UPDATE'
    and old.tipo is not distinct from new.tipo
    and old.raizid is not distinct from new.raizid
    and old.status is not distinct from new.status then
    return null;
  end if;

  if v_old_tipo in (2, 3) then
    perform public.recalcular_status_pai_demandas(v_old_parent_id, v_old_tipo);
  end if;

  if v_new_tipo in (2, 3)
    and (v_new_tipo is distinct from v_old_tipo
      or v_new_parent_id is distinct from v_old_parent_id) then
    perform public.recalcular_status_pai_demandas(v_new_parent_id, v_new_tipo);
  end if;

  return null;
end;
$function$;

create trigger demandas_propagar_status_hierarquia
after insert or update or delete on public.demandas
for each row execute function public.propagar_status_hierarquia_demandas();

grant update (status) on table public.demandas to anon;
