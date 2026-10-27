alter table public.demandas
  add column hora_inicio time without time zone,
  add column hora_fim time without time zone;

comment on column public.demandas.hora_inicio is
  'Horario inicial da execucao diaria de uma subtarefa.';

comment on column public.demandas.hora_fim is
  'Horario final da execucao diaria de uma subtarefa.';

update public.demandas
set hora_inicio = time '09:00',
    hora_fim = time '10:00'
where tipo = 3
  and data_exec is not null
  and (hora_inicio is null or hora_fim is null or hora_inicio >= hora_fim);

alter table public.demandas
  add constraint demandas_horario_planejamento_check
  check (
    (tipo = 3 and (
      (data_exec is null and hora_inicio is null and hora_fim is null)
      or (
        data_exec is not null
        and hora_inicio is not null
        and hora_fim is not null
        and hora_inicio < hora_fim
      )
    ))
    or (tipo in (1, 2) and hora_inicio is null and hora_fim is null)
  );

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
      and subtask.data_exec is not null;
  end if;

  return null;
end;
$function$;

create or replace function public.validar_horario_planejamento_diario()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.tipo = 3
    and new.data_exec is not null
    and new.hora_inicio is not null
    and new.hora_fim is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      713412,
      new.data_exec - date '2000-01-01'
    );

    if exists (
      select 1
      from public.demandas as scheduled
      where scheduled.tipo = 3
        and scheduled.data_exec = new.data_exec
        and scheduled.id <> new.id
        and scheduled.hora_inicio is not null
        and scheduled.hora_fim is not null
        and scheduled.hora_inicio < new.hora_fim
        and scheduled.hora_fim > new.hora_inicio
    ) then
      raise exception 'Esse horario ja esta ocupado por outra subtarefa.'
        using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$function$;

create trigger demandas_validar_horario_planejamento_diario
before insert or update of data_exec, hora_inicio, hora_fim on public.demandas
for each row execute function public.validar_horario_planejamento_diario();

grant update (hora_inicio, hora_fim) on table public.demandas to anon;
