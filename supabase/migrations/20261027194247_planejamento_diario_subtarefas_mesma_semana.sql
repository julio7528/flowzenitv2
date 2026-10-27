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

    if not found
      or v_data_exec_tarefa is null
      or pg_catalog.date_trunc('week', v_data_exec_tarefa::timestamp)::date
        is distinct from pg_catalog.date_trunc('week', new.data_exec::timestamp)::date then
      raise exception 'A subtarefa deve usar uma data da mesma semana da tarefa pai alocada.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

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
    set data_exec = null,
        hora_inicio = null,
        hora_fim = null
    where subtask.tipo = 3
      and subtask.raizid = new.id
      and subtask.data_exec is not null
      and (
        new.data_exec is null
        or pg_catalog.date_trunc('week', subtask.data_exec::timestamp)::date
          is distinct from pg_catalog.date_trunc('week', new.data_exec::timestamp)::date
      );
  end if;

  return null;
end;
$function$;
