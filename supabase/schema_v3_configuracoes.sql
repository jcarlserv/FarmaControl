-- ============================================================================
-- SCHEMA SUPABASE v3 — Configurações: logomarcas + troca de senha
-- Rode isto DEPOIS do schema.sql (v2), no SQL Editor. Este script só
-- ADICIONA coisas — não apaga nenhuma tabela nem dado existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ORGANIZACAO — linha única com o nome/logo da OS (o nível acima de município).
-- ----------------------------------------------------------------------------
create table if not exists organizacao (
  id boolean primary key default true,
  nome text not null default 'Minha Organização',
  logo_url text,
  constraint linha_unica check (id)
);
insert into organizacao (id, nome) values (true, 'Minha Organização') on conflict (id) do nothing;

alter table organizacao enable row level security;
drop policy if exists "ver organizacao" on organizacao;
create policy "ver organizacao" on organizacao for select using (auth.uid() is not null);
drop policy if exists "admin edita organizacao" on organizacao;
create policy "admin edita organizacao" on organizacao for update
  using (meu_papel() = 'Admin') with check (meu_papel() = 'Admin');

-- ----------------------------------------------------------------------------
-- Logomarca de município e de unidade — só a coluna nova.
-- ----------------------------------------------------------------------------
alter table municipios add column if not exists logo_url text;
alter table unidades_saude add column if not exists logo_url text;

-- Gerente já editava tudo do seu município? Não — a policy v2 só permitia
-- Admin editar municípios. Esta policy adicional dá ao Gerente permissão de
-- editar (inclusive o logo) só do seu próprio município.
drop policy if exists "gerente edita seu municipio" on municipios;
create policy "gerente edita seu municipio" on municipios for update
  using (meu_papel() = 'Gerente' and id = meu_municipio())
  with check (meu_papel() = 'Gerente' and id = meu_municipio());

-- Mesma ideia: Coordenador passa a poder editar (inclusive o logo) só da
-- própria unidade — antes só Admin/Gerente podiam editar unidades.
drop policy if exists "coordenador edita sua unidade" on unidades_saude;
create policy "coordenador edita sua unidade" on unidades_saude for update
  using (meu_papel() = 'Coordenador' and id = minha_unidade())
  with check (meu_papel() = 'Coordenador' and id = minha_unidade());

-- ----------------------------------------------------------------------------
-- BUCKET DE ARMAZENAMENTO PARA AS IMAGENS DE LOGO
-- Convenção de caminho dos arquivos dentro do bucket:
--   organizacao/logo.png
--   municipio/<municipio_id>/logo.png
--   unidade/<unidade_id>/logo.png
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('logos', 'logos', true)
  on conflict (id) do nothing;

-- Leitura: pública (é assim que o <img> do painel exibe o logo sem precisar de login)
drop policy if exists "ler logos" on storage.objects;
create policy "ler logos" on storage.objects for select
  using (bucket_id = 'logos');

-- Escrita da logo da ORGANIZAÇÃO: só Admin
drop policy if exists "admin escreve logo organizacao" on storage.objects;
create policy "admin escreve logo organizacao" on storage.objects for all
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = 'organizacao' and meu_papel() = 'Admin')
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = 'organizacao' and meu_papel() = 'Admin');

-- Escrita da logo de MUNICÍPIO: Admin, ou Gerente só do seu próprio município
drop policy if exists "admin e gerente escrevem logo municipio" on storage.objects;
create policy "admin e gerente escrevem logo municipio" on storage.objects for all
  using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = 'municipio' and (
      meu_papel() = 'Admin' or
      (meu_papel() = 'Gerente' and (storage.foldername(name))[2] = meu_municipio()::text)
    )
  )
  with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = 'municipio' and (
      meu_papel() = 'Admin' or
      (meu_papel() = 'Gerente' and (storage.foldername(name))[2] = meu_municipio()::text)
    )
  );

-- Escrita da logo de UNIDADE: Admin, Gerente (unidade do seu município) ou
-- Coordenador (só a própria unidade)
drop policy if exists "admin gerente e coordenador escrevem logo unidade" on storage.objects;
create policy "admin gerente e coordenador escrevem logo unidade" on storage.objects for all
  using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = 'unidade' and (
      meu_papel() = 'Admin' or
      (meu_papel() = 'Gerente' and (storage.foldername(name))[2]::uuid in (select id from unidades_saude where municipio_id = meu_municipio())) or
      (meu_papel() = 'Coordenador' and (storage.foldername(name))[2] = minha_unidade()::text)
    )
  )
  with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = 'unidade' and (
      meu_papel() = 'Admin' or
      (meu_papel() = 'Gerente' and (storage.foldername(name))[2]::uuid in (select id from unidades_saude where municipio_id = meu_municipio())) or
      (meu_papel() = 'Coordenador' and (storage.foldername(name))[2] = minha_unidade()::text)
    )
  );

-- ----------------------------------------------------------------------------
-- Fim. Depois de rodar isto, a tela "Configurações" do painel já consegue:
-- - trocar a própria senha (todo mundo)
-- - redefinir senha de outros usuários (Admin: qualquer um; Gerente: só
--   Coordenador/Colaborador do seu município — via api/redefinir-senha.js)
-- - subir logomarca da Organização (Admin), do Município (Admin/Gerente) e
--   da Unidade de Saúde (Admin/Gerente/Coordenador)
-- ----------------------------------------------------------------------------
