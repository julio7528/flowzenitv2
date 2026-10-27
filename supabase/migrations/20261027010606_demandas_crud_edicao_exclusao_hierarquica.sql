alter table public.demandas
  drop constraint demandas_raizid_fkey;

alter table public.demandas
  add constraint demandas_raizid_fkey
  foreign key (raizid)
  references public.demandas(id)
  on delete restrict;

revoke update on table public.demandas from anon;
grant update (demanda) on table public.demandas to anon;
grant delete on table public.demandas to anon;

create policy public_can_update_demandas
on public.demandas
for update to anon
using (true)
with check (true);

create policy public_can_delete_demandas
on public.demandas
for delete to anon
using (true);
