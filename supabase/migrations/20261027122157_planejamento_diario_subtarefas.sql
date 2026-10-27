alter table public.demandas
  drop constraint if exists demandas_data_exec_sem_subtarefa_check;

comment on column public.demandas.data_exec is
  'Data de alocacao semanal para demandas/tarefas e data de execucao diaria para subtarefas.';

create or replace function public.validar_data_exec_subtarefa()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_data_exec_tarefa date;
begin
  if new.tipo = 3 and new.data_exec is not null then
    select task.data_exec
      into v_data_exec_tarefa
      from public.demandas as task
      where task.id = new.raizid
        and task.tipo = 2;

    if not found or v_data_exec_tarefa is distinct from new.data_exec then
      raise exception 'A subtarefa deve usar a mesma data_exec da tarefa pai.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

create trigger demandas_validar_data_exec_subtarefa
before insert or update of data_exec, tipo, raizid on public.demandas
for each row execute function public.validar_data_exec_subtarefa();

create or replace function public.limpar_data_exec_subtarefas_ao_mover_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.tipo = 2
    and new.tipo = 2
    and old.data_exec is distinct from new.data_exec then
    update public.demandas as subtask
    set data_exec = null
    where subtask.tipo = 3
      and subtask.raizid = new.id
      and subtask.data_exec is not null;
  end if;

  return null;
end;
$function$;

create trigger demandas_limpar_data_subtarefas_ao_mover_tarefa
after update of data_exec on public.demandas
for each row execute function public.limpar_data_exec_subtarefas_ao_mover_tarefa();
