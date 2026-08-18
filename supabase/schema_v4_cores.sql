-- ============================================================================
-- SCHEMA SUPABASE v4 — Cor de destaque (Organização e Município)
-- Rode DEPOIS do schema.sql e do schema_v3_configuracoes.sql. Aditivo, não
-- apaga nada.
-- ============================================================================

alter table organizacao add column if not exists cor_acento text;
alter table municipios add column if not exists cor_acento text;

-- Nenhuma policy nova é necessária: as regras de UPDATE que já existem em
-- "organizacao" (Admin) e "municipios" (Admin, ou Gerente no seu próprio
-- município) já cobrem essa coluna nova, já que elas liberam a linha inteira.
