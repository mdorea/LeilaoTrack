-- ---------------------------------------------------------------------
-- Anotações e PDFs nos favoritos (só a própria pessoa vê e mexe)
-- Rode no Supabase: SQL Editor > New query > colar > Run. Pode rodar de novo.
-- ---------------------------------------------------------------------
create table if not exists public.anotacoes (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lote_id        text not null check (lote_id ~ '^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$'),
  texto          text not null check (char_length(texto) between 1 and 5000),
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, lote_id)
);

create table if not exists public.anexos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lote_id    text not null check (lote_id ~ '^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$'),
  nome       text not null check (char_length(btrim(nome)) between 1 and 120),
  tamanho    int  not null check (tamanho between 1 and 10485760),
  caminho    text not null unique check (caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' and split_part(caminho, '/', 1) = user_id::text),
  criado_em  timestamptz not null default now()
);
create index if not exists anexos_pessoa_idx on public.anexos (user_id, lote_id);

-- limites por pessoa: 10 PDFs por imóvel, 200 no total
create or replace function public._limite_anexos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.anexos where user_id = new.user_id and lote_id = new.lote_id) >= 10
     or (select count(*) from public.anexos where user_id = new.user_id) >= 200 then
    raise exception 'limite_atingido';
  end if;
  return new;
end $$;
drop trigger if exists limite_anexos on public.anexos;
create trigger limite_anexos before insert on public.anexos
  for each row execute function public._limite_anexos();

alter table public.anotacoes enable row level security;
alter table public.anexos    enable row level security;
revoke all on public.anotacoes, public.anexos from anon, authenticated;
grant select, insert, update, delete on public.anotacoes to authenticated;
grant select, insert, delete on public.anexos to authenticated;

drop policy if exists "anotações da própria pessoa" on public.anotacoes;
create policy "anotações da própria pessoa" on public.anotacoes
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro())
  with check (user_id = auth.uid() and public.e_membro());

drop policy if exists "anexos da própria pessoa" on public.anexos;
create policy "anexos da própria pessoa" on public.anexos
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro())
  with check (user_id = auth.uid() and public.e_membro());

-- pasta privada dos PDFs: cada pessoa só enxerga a pasta com o próprio id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ver meus pdfs" on storage.objects;
create policy "ver meus pdfs" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text and public.e_membro());
drop policy if exists "enviar meus pdfs" on storage.objects;
create policy "enviar meus pdfs" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text and public.e_membro());
drop policy if exists "apagar meus pdfs" on storage.objects;
create policy "apagar meus pdfs" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text and public.e_membro());
