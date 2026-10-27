alter table public.recorrente
  add column dias_semana smallint[];

update public.recorrente
set dias_semana = array[dia_semana];

alter table public.recorrente
  alter column dias_semana set not null;

drop index if exists public.recorrente_dia_periodo_idx;

alter table public.recorrente
  drop column dia_semana;

alter table public.recorrente
  add constraint recorrente_dias_semana_check
  check (
    cardinality(dias_semana) between 1 and 7
    and dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

create index recorrente_dias_semana_gin_idx
  on public.recorrente using gin (dias_semana);

create index recorrente_periodo_idx
  on public.recorrente (data_inicial, data_final);
