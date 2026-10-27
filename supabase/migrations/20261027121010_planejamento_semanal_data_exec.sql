alter table public.demandas
  add column data_exec date;

alter table public.demandas
  add constraint demandas_data_exec_sem_subtarefa_check
  check (tipo <> 3 or data_exec is null);

create or replace function public.validar_data_exec_planejamento()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.tipo = 1
    and new.data_exec is not null
    and exists (
      select 1
      from public.demandas as task
      where task.raizid = new.id
        and task.tipo = 2
    ) then
    raise exception 'Demandas com tarefas vinculadas nao podem receber data_exec.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger demandas_validar_data_exec_planejamento
before insert or update of data_exec, tipo, raizid on public.demandas
for each row execute function public.validar_data_exec_planejamento();

create or replace function public.limpar_data_exec_demanda_com_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.tipo = 2 then
    update public.demandas as demand
    set data_exec = null
    where demand.id = new.raizid
      and demand.tipo = 1
      and demand.data_exec is not null;
  end if;

  return null;
end;
$function$;

create trigger demandas_limpar_data_demanda_com_tarefa
after insert or update of tipo, raizid on public.demandas
for each row execute function public.limpar_data_exec_demanda_com_tarefa();

grant update (data_exec) on table public.demandas to anon;
