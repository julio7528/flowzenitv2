alter table public.recorrente
  add column hora_fim time without time zone;

alter table public.recorrente
  add constraint recorrente_horario_check
  check (hora_fim is null or hora_fim > hora);

comment on column public.recorrente.hora is
  'Horário inicial da rotina recorrente.';

comment on column public.recorrente.hora_fim is
  'Horário final da rotina recorrente; nulo mantém compatibilidade com registros antigos.';
