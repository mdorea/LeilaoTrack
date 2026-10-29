-- =====================================================================
--  LeilãoTrack · banco de dados (Supabase)
--  Rode este arquivo INTEIRO uma vez no Supabase: SQL Editor > New query
--  > colar > Run. Pode rodar de novo sem problema: ele recria as funções
--  e as regras, mas não apaga os dados de quem já está cadastrado.
--
--  Regra geral de segurança: nenhuma tabela é aberta. Cada pessoa só lê
--  e grava as próprias coisas; o que é do administrador passa por funções
--  que conferem o papel antes de fazer qualquer coisa. Quem não tem
--  convite não consegue nem criar conta.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 40),
  papel      text not null default 'membro' check (papel in ('membro', 'admin')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.convites (
  id           bigint generated always as identity primary key,
  email        text not null check (email = lower(btrim(email)) and char_length(email) between 5 and 254),
  nome         text not null check (char_length(btrim(nome)) between 1 and 40),
  tipo         text not null default 'convite' check (tipo in ('convite', 'senha')),
  papel        text not null default 'membro' check (papel in ('membro', 'admin')),
  codigo_hash  text not null,
  criado_por   uuid references auth.users(id) on delete set null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  usado_em     timestamptz,
  tentativas   int not null default 0
);
create index if not exists convites_email_idx on public.convites (email);

create table if not exists public.favoritos (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lote_id    text not null check (lote_id ~ '^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$'),
  criado_em  timestamptz not null default now(),
  primary key (user_id, lote_id)
);

create table if not exists public.preferencias (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ufs            text[] not null default '{}' check (cardinality(ufs) <= 27),
  tipos          text[] not null default '{}' check (cardinality(tipos) <= 12),
  configurado    boolean not null default false,
  alertas_visto  text check (alertas_visto is null or char_length(alertas_visto) <= 30),
  ajustes        jsonb not null default '{}'::jsonb check (pg_column_size(ajustes) <= 4000),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.calculos (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lote_id        text not null check (lote_id ~ '^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$'),
  valores        jsonb not null check (jsonb_typeof(valores) = 'object' and pg_column_size(valores) <= 4000),
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, lote_id)
);

-- ---------------------------------------------------------------------
-- Funções de apoio (quem é membro, quem é administrador)
-- ---------------------------------------------------------------------
create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo);
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'admin');
$$;

-- código de 12 letras/números (ex.: K7QM-2HXP-9WRT), ~60 bits de acaso
create or replace function public._novo_codigo() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  s text := '';
begin
  for i in 0..11 loop
    s := s || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1);
    if i in (3, 7) then s := s || '-'; end if;
  end loop;
  return s;
end $$;

create or replace function public._hash_codigo(p text) returns text
language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;

create or replace function public._email_valido(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' and char_length(p) <= 254;
$$;

-- ---------------------------------------------------------------------
-- Cadastro: só cria conta quem tem convite válido (e-mail + código)
-- ---------------------------------------------------------------------
create or replace function public._ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.convites%rowtype;
  v_codigo text := new.raw_user_meta_data ->> 'convite';
begin
  select * into c from public.convites
   where email = lower(new.email) and tipo = 'convite' and usado_em is null and expira_em > now()
   order by criado_em desc limit 1
   for update;

  if c.id is null or v_codigo is null or c.tentativas >= 5
     or c.codigo_hash <> public._hash_codigo(v_codigo) then
    raise exception 'convite_invalido' using errcode = 'P0001';
  end if;

  update public.convites set usado_em = now() where id = c.id;
  insert into public.perfis (id, nome, papel) values (new.id, btrim(c.nome), c.papel);
  insert into public.preferencias (user_id) values (new.id) on conflict do nothing;
  -- o código não fica guardado na conta
  update auth.users set raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'convite')
                                             || jsonb_build_object('nome', btrim(c.nome))
   where id = new.id;
  return new;
end $$;

drop trigger if exists leilaotrack_ao_criar_usuario on auth.users;
create trigger leilaotrack_ao_criar_usuario
  after insert on auth.users
  for each row execute function public._ao_criar_usuario();

-- confere um convite antes do cadastro (para mostrar o nome e avisar erro).
-- Conta tentativas erradas: depois de 5, o convite fica bloqueado.
create or replace function public.conferir_convite(p_email text, p_codigo text)
returns table (ok boolean, nome text, motivo text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.convites%rowtype;
begin
  select * into c from public.convites
   where email = lower(btrim(p_email)) and tipo = 'convite' and usado_em is null and expira_em > now()
   order by criado_em desc limit 1
   for update;
  if c.id is null then
    return query select false, null::text, 'Convite ou código inválido. Confira o e-mail e o código, ou peça um novo convite.'; return;
  end if;
  if c.tentativas >= 5 then
    return query select false, null::text, 'Convite ou código inválido. Confira o e-mail e o código, ou peça um novo convite.'; return;
  end if;
  if c.codigo_hash <> public._hash_codigo(p_codigo) then
    update public.convites set tentativas = tentativas + 1 where id = c.id;
    return query select false, null::text, 'Convite ou código inválido. Confira o e-mail e o código, ou peça um novo convite.'; return;
  end if;
  return query select true, c.nome, null::text;
end $$;

-- ---------------------------------------------------------------------
-- Nova senha com código (o administrador gera o código para a pessoa)
-- ---------------------------------------------------------------------
create or replace function public.redefinir_senha(p_email text, p_codigo text, p_senha text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.convites%rowtype;
  v_user uuid;
begin
  if p_senha is null or char_length(p_senha) < 8 or octet_length(p_senha) > 72 then
    return 'A senha precisa ter de 8 a 72 caracteres (acentos contam em dobro).';
  end if;
  select * into c from public.convites
   where email = lower(btrim(p_email)) and tipo = 'senha' and usado_em is null and expira_em > now()
   order by criado_em desc limit 1
   for update;
  if c.id is null then
    return 'E-mail ou código inválido. Confira os dois, ou peça um novo código ao administrador.';
  end if;
  if c.tentativas >= 5 then
    return 'E-mail ou código inválido. Confira os dois, ou peça um novo código ao administrador.';
  end if;
  if c.codigo_hash <> public._hash_codigo(p_codigo) then
    update public.convites set tentativas = tentativas + 1 where id = c.id;
    return 'E-mail ou código inválido. Confira os dois, ou peça um novo código ao administrador.';
  end if;
  select id into v_user from auth.users where lower(email) = c.email;
  if v_user is null then
    return 'Conta não encontrada.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = v_user;
  -- encerra as sessões abertas em outros aparelhos
  delete from auth.refresh_tokens where user_id::text = v_user::text;
  delete from auth.sessions where user_id = v_user;
  update public.convites set usado_em = now() where id = c.id;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------
-- Funções da própria pessoa
-- ---------------------------------------------------------------------
create or replace function public.meu_perfil()
returns table (id uuid, nome text, papel text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.papel, u.email::text
    from public.perfis p join auth.users u on u.id = p.id
   where p.id = auth.uid() and p.ativo;
$$;

create or replace function public.mudar_meu_nome(p_nome text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_membro() then raise exception 'sem_permissao'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 40 then raise exception 'nome_invalido'; end if;
  update public.perfis set nome = btrim(p_nome) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Funções do administrador
-- ---------------------------------------------------------------------
create or replace function public.admin_criar_convite(p_email text, p_nome text)
returns table (codigo text, expira_em timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_codigo text;
  v_expira timestamptz := now() + interval '7 days';
begin
  if not public.e_admin() then raise exception 'sem_permissao'; end if;
  if not public._email_valido(v_email) then raise exception 'email_invalido'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 40 then raise exception 'nome_invalido'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'ja_cadastrado'; end if;
  if (select count(*) from public.convites where criado_por = auth.uid() and criado_em > now() - interval '1 day') >= 50 then
    raise exception 'limite_diario';
  end if;
  update public.convites set expira_em = now() where email = v_email and tipo = 'convite' and usado_em is null;
  v_codigo := public._novo_codigo();
  insert into public.convites (email, nome, tipo, codigo_hash, criado_por, expira_em)
  values (v_email, btrim(p_nome), 'convite', public._hash_codigo(v_codigo), auth.uid(), v_expira);
  return query select v_codigo, v_expira;
end $$;

create or replace function public.admin_codigo_senha(p_user uuid)
returns table (codigo text, expira_em timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_nome text;
  v_codigo text;
  v_expira timestamptz := now() + interval '24 hours';
begin
  if not public.e_admin() then raise exception 'sem_permissao'; end if;
  select lower(u.email), p.nome into v_email, v_nome
    from auth.users u join public.perfis p on p.id = u.id where u.id = p_user;
  if v_email is null then raise exception 'nao_encontrado'; end if;
  update public.convites set expira_em = now() where email = v_email and tipo = 'senha' and usado_em is null;
  v_codigo := public._novo_codigo();
  insert into public.convites (email, nome, tipo, codigo_hash, criado_por, expira_em)
  values (v_email, v_nome, 'senha', public._hash_codigo(v_codigo), auth.uid(), v_expira);
  return query select v_codigo, v_expira;
end $$;

create or replace function public.admin_membros()
returns table (id uuid, nome text, email text, papel text, situacao text, desde timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin() then raise exception 'sem_permissao'; end if;
  return query
    select p.id, p.nome, u.email::text, p.papel, 'ativo'::text, p.criado_em, u.last_sign_in_at
      from public.perfis p join auth.users u on u.id = p.id
    union all
    select null::uuid, c.nome, c.email, c.papel, 'pendente'::text, c.criado_em, null::timestamptz
      from public.convites c
     where c.tipo = 'convite' and c.usado_em is null and c.expira_em > now()
       and not exists (select 1 from auth.users u2 where lower(u2.email) = c.email)
    order by 6 desc;
end $$;

create or replace function public.admin_cancelar_convite(p_email text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_admin() then raise exception 'sem_permissao'; end if;
  update public.convites set expira_em = now()
   where email = lower(btrim(p_email)) and tipo = 'convite' and usado_em is null;
end $$;

create or replace function public.admin_remover(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.e_admin() then raise exception 'sem_permissao'; end if;
  if p_user = auth.uid() then raise exception 'nao_pode_remover_a_si'; end if;
  delete from auth.users where id = p_user;  -- apaga em cascata favoritos, preferências etc.
end $$;

-- Primeiro administrador: rode no SQL Editor (não funciona pelo site).
--   select * from public.instalar_admin('seu-email@exemplo.com', 'Seu nome');
create or replace function public.instalar_admin(p_email text, p_nome text)
returns table (codigo text, expira_em timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_codigo text := public._novo_codigo();
  v_expira timestamptz := now() + interval '2 days';
begin
  if not public._email_valido(v_email) then raise exception 'email_invalido'; end if;
  update public.convites set expira_em = now() where email = v_email and tipo = 'convite' and usado_em is null;
  insert into public.convites (email, nome, tipo, papel, codigo_hash, expira_em)
  values (v_email, btrim(p_nome), 'convite', 'admin', public._hash_codigo(v_codigo), v_expira);
  return query select v_codigo, v_expira;
end $$;

-- ---------------------------------------------------------------------
-- Limites por pessoa (evita abuso)
-- ---------------------------------------------------------------------
create or replace function public._limite_por_pessoa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if tg_table_name = 'favoritos' then
    select count(*) into n from public.favoritos where user_id = new.user_id;
  else
    select count(*) into n from public.calculos where user_id = new.user_id;
  end if;
  if n >= 1000 then raise exception 'limite_atingido'; end if;
  return new;
end $$;

drop trigger if exists limite_favoritos on public.favoritos;
create trigger limite_favoritos before insert on public.favoritos
  for each row execute function public._limite_por_pessoa();
drop trigger if exists limite_calculos on public.calculos;
create trigger limite_calculos before insert on public.calculos
  for each row execute function public._limite_por_pessoa();

-- ---------------------------------------------------------------------
-- Regras de acesso (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.perfis       enable row level security;
alter table public.convites     enable row level security;
alter table public.favoritos    enable row level security;
alter table public.preferencias enable row level security;
alter table public.calculos     enable row level security;

revoke all on public.perfis, public.convites, public.favoritos, public.preferencias, public.calculos from anon, authenticated;
grant select on public.perfis to authenticated;
grant select, insert, delete on public.favoritos to authenticated;
grant select, insert, update on public.preferencias to authenticated;
grant select, insert, update, delete on public.calculos to authenticated;

drop policy if exists "ver o próprio perfil" on public.perfis;
create policy "ver o próprio perfil" on public.perfis
  for select to authenticated using (id = auth.uid());

drop policy if exists "favoritos da própria pessoa" on public.favoritos;
create policy "favoritos da própria pessoa" on public.favoritos
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro())
  with check (user_id = auth.uid() and public.e_membro());

drop policy if exists "preferências da própria pessoa" on public.preferencias;
create policy "preferências da própria pessoa" on public.preferencias
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro())
  with check (user_id = auth.uid() and public.e_membro());

drop policy if exists "cálculos da própria pessoa" on public.calculos;
create policy "cálculos da própria pessoa" on public.calculos
  for all to authenticated
  using (user_id = auth.uid() and public.e_membro())
  with check (user_id = auth.uid() and public.e_membro());
-- convites: nenhuma regra = ninguém lê nem grava direto (só pelas funções acima)

-- quem pode chamar cada função
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.e_membro(), public.e_admin() to authenticated;
grant execute on function public.conferir_convite(text, text) to anon, authenticated;
grant execute on function public.redefinir_senha(text, text, text) to anon, authenticated;
grant execute on function public.meu_perfil(), public.mudar_meu_nome(text) to authenticated;
grant execute on function public.admin_criar_convite(text, text), public.admin_codigo_senha(uuid),
                          public.admin_membros(), public.admin_cancelar_convite(text),
                          public.admin_remover(uuid) to authenticated;
-- funções novas criadas depois também nascem fechadas
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Arquivo dos lotes: pasta privada, só membros leem; só o coletor grava
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privado', 'privado', false, 20971520, array['application/gzip', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "membros leem os lotes" on storage.objects;
create policy "membros leem os lotes" on storage.objects
  for select to authenticated
  using (bucket_id = 'privado' and (name = 'versao.json' or name ~ '^lotes-[a-f0-9]{32}\.json\.gz$') and public.e_membro());
-- o arquivo dos lotes ganha um nome novo e aleatório a cada leitura: um link assinado que alguém
-- tenha gerado enquanto era membro para de receber dados novos na leitura seguinte
-- sem regra de gravação: só a chave secreta do coletor (que fica no GitHub) consegue gravar
