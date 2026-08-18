-- ============================================================================
-- SCHEMA SUPABASE v2 — Estoque Farmacêutico multi-município
-- Rode isto no Supabase: SQL Editor > New query > cole tudo > Run.
-- Se você já tinha rodado o schema.sql v1, rode este por cima — ele recria
-- as tabelas do zero (drop + create). Se já tem dados de teste importantes,
-- faça backup antes.
-- ============================================================================

create extension if not exists "pgcrypto";

drop table if exists movimentacoes cascade;
drop table if exists listas_opcoes cascade;
drop table if exists perfis cascade;
drop table if exists unidades_saude cascade;
drop table if exists municipios cascade;

-- ----------------------------------------------------------------------------
-- MUNICIPIOS — o nível mais alto de escopo, abaixo do Admin.
-- ----------------------------------------------------------------------------
create table municipios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uf text not null,
  criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- UNIDADES_SAUDE — Hospitais, UBS, UPAs dentro de um município.
-- ----------------------------------------------------------------------------
create table unidades_saude (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references municipios(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('Hospital','UBS','UPA')),
  criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PERFIS — papel + escopo de cada usuário do Supabase Auth.
-- Admin:       municipio_id NULL, unidade_id NULL  (vê tudo)
-- Gerente:     municipio_id preenchido, unidade_id NULL  (vê o município inteiro)
-- Coordenador: municipio_id + unidade_id preenchidos  (vê só a unidade)
-- Colaborador: municipio_id + unidade_id preenchidos  (vê só a unidade, só cria)
-- ----------------------------------------------------------------------------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null check (papel in ('Admin','Gerente','Coordenador','Colaborador')),
  municipio_id uuid references municipios(id),
  unidade_id uuid references unidades_saude(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint escopo_coerente check (
    (papel = 'Admin' and municipio_id is null and unidade_id is null) or
    (papel = 'Gerente' and municipio_id is not null and unidade_id is null) or
    (papel in ('Coordenador','Colaborador') and municipio_id is not null and unidade_id is not null)
  )
);

-- ----------------------------------------------------------------------------
-- LISTAS_OPCOES — opções dos <select> (Turno, E/S, Material, Destino/setor).
-- Continuam globais nesta versão (não variam por município). Se um dia
-- precisar de listas diferentes por município, dá pra adicionar uma coluna
-- municipio_id aqui (nullable = lista global; preenchida = só daquele município).
-- ----------------------------------------------------------------------------
create table listas_opcoes (
  id bigint generated always as identity primary key,
  lista text not null,
  valor text not null,
  unique (lista, valor)
);

-- ----------------------------------------------------------------------------
-- MOVIMENTACOES — agora presas a uma unidade de saúde específica.
-- "destino" continua existindo como o setor DENTRO da unidade (Farmácia
-- Central, Enfermaria A, UTI...), a unidade em si é outra coisa (o hospital/
-- UBS/UPA). Ex.: unidade = "Hospital Municipal de Sobral", destino = "UTI".
-- ----------------------------------------------------------------------------
create table movimentacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades_saude(id),
  data date not null default current_date,
  turno text,
  colaborador text,
  tipo text not null check (tipo in ('Entrada','Saída')),
  material text not null,
  lote text,
  validade date,
  destino text,
  nome_paciente text,
  nota_fiscal text,
  qtde numeric not null check (qtde > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);
create index on movimentacoes (unidade_id);
create index on movimentacoes (data);

-- ----------------------------------------------------------------------------
-- FUNÇÕES AUXILIARES — leem o perfil de quem está logado (security definer
-- para poderem ser usadas dentro das próprias policies de RLS sem recursão).
-- ----------------------------------------------------------------------------
create or replace function meu_papel() returns text
language sql security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo;
$$;

create or replace function meu_municipio() returns uuid
language sql security definer set search_path = public as $$
  select municipio_id from perfis where id = auth.uid() and ativo;
$$;

create or replace function minha_unidade() returns uuid
language sql security definer set search_path = public as $$
  select unidade_id from perfis where id = auth.uid() and ativo;
$$;

-- unidades que o usuário logado tem permissão de enxergar/lançar movimentação
create or replace function minhas_unidades_permitidas() returns setof uuid
language sql security definer set search_path = public as $$
  select id from unidades_saude where
    meu_papel() = 'Admin'
    or (meu_papel() = 'Gerente' and municipio_id = meu_municipio())
    or (meu_papel() in ('Coordenador','Colaborador') and id = minha_unidade());
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table municipios enable row level security;
alter table unidades_saude enable row level security;
alter table perfis enable row level security;
alter table listas_opcoes enable row level security;
alter table movimentacoes enable row level security;

-- MUNICIPIOS: Admin vê/edita todos; os demais só enxergam o próprio.
create policy "ver municipios" on municipios for select
  using (meu_papel() = 'Admin' or id = meu_municipio());
create policy "admin gerencia municipios" on municipios for all
  using (meu_papel() = 'Admin') with check (meu_papel() = 'Admin');

-- UNIDADES_SAUDE: Admin tudo; Gerente as do seu município; Coordenador/Colaborador só a própria.
create policy "ver unidades" on unidades_saude for select
  using (id in (select minhas_unidades_permitidas()));
create policy "admin e gerente gerenciam unidades" on unidades_saude for insert
  with check (meu_papel() = 'Admin' or (meu_papel() = 'Gerente' and municipio_id = meu_municipio()));
create policy "admin e gerente editam unidades" on unidades_saude for update
  using (meu_papel() = 'Admin' or (meu_papel() = 'Gerente' and municipio_id = meu_municipio()));
create policy "admin exclui unidades" on unidades_saude for delete
  using (meu_papel() = 'Admin');

-- PERFIS: cada um vê o próprio; Gerente vê os do seu município; Admin vê todos.
-- Criação de perfil (junto com o login) é feita pela função serverless com a
-- service_role key, que ignora RLS — por isso não existe policy de "insert" aqui.
create policy "ver perfis" on perfis for select
  using (id = auth.uid() or meu_papel() = 'Admin' or (meu_papel() = 'Gerente' and municipio_id = meu_municipio()));
create policy "admin edita qualquer perfil" on perfis for update
  using (meu_papel() = 'Admin') with check (true);
create policy "gerente edita colaboradores do seu municipio" on perfis for update
  using (meu_papel() = 'Gerente' and municipio_id = meu_municipio() and papel in ('Coordenador','Colaborador'))
  with check (meu_papel() = 'Gerente' and municipio_id = meu_municipio() and papel in ('Coordenador','Colaborador'));

-- LISTAS_OPCOES: qualquer logado lê; Admin/Gerente escrevem.
create policy "ler listas" on listas_opcoes for select using (auth.uid() is not null);
create policy "admin e gerente editam listas" on listas_opcoes for all
  using (meu_papel() in ('Admin','Gerente')) with check (meu_papel() in ('Admin','Gerente'));

-- MOVIMENTACOES: ver/criar dentro do escopo; editar/excluir Admin+Gerente+Coordenador (não Colaborador).
create policy "ver movimentacoes do meu escopo" on movimentacoes for select
  using (unidade_id in (select minhas_unidades_permitidas()));
create policy "criar movimentacoes no meu escopo" on movimentacoes for insert
  with check (unidade_id in (select minhas_unidades_permitidas()));
create policy "editar movimentacoes (nao-colaborador)" on movimentacoes for update
  using (unidade_id in (select minhas_unidades_permitidas()) and meu_papel() <> 'Colaborador');
create policy "excluir movimentacoes (nao-colaborador)" on movimentacoes for delete
  using (unidade_id in (select minhas_unidades_permitidas()) and meu_papel() <> 'Colaborador');

-- ----------------------------------------------------------------------------
-- Dados de exemplo nas listas (edite/apague depois pelo painel)
-- ----------------------------------------------------------------------------
insert into listas_opcoes (lista, valor) values
  ('Turno','Manhã'), ('Turno','Tarde'), ('Turno','Noite'),
  ('E/S','Entrada'), ('E/S','Saída'),
  ('Destino','Farmácia Central'), ('Destino','Enfermaria A'), ('Destino','Enfermaria B'),
  ('Destino','Centro Cirúrgico'), ('Destino','UTI'), ('Destino','Ambulatório')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- COMO CRIAR O PRIMEIRO ADMIN (só uma vez, manualmente):
-- 1. Authentication > Users > Add user (e-mail + senha).
-- 2. Copie o UUID gerado e rode:
--    insert into perfis (id, nome, papel) values ('COLE-O-UUID-AQUI', 'Seu nome', 'Admin');
-- Depois disso, todo o resto (municípios, unidades, outros usuários) se
-- cadastra pela tela "Gestão de Acesso" dentro do próprio painel, logado
-- como esse Admin.
-- ----------------------------------------------------------------------------
