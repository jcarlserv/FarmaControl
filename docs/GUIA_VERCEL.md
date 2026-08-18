# Guia — publicar no Vercel

O Vercel publica tudo junto: os arquivos estáticos (`index.html`, `css/`, `js/`) e as funções serverless em `api/` (`criar-usuario.js` e `redefinir-senha.js` — só elas rodam código no servidor, para poder usar a service_role key com segurança).

## Passo a passo

1. Suba o repositório para o GitHub (veja `docs/GUIA_GITHUB.md`, se ainda não fez).
2. Acesse **vercel.com**, entre com sua conta do GitHub.
3. **Add New → Project** → escolha o repositório.
4. Configuração do projeto:
   - **Root Directory:** `supabase-version`.
   - **Framework Preset:** "Other" — é HTML puro, sem build.
   - Não precisa mexer em Build Command/Output Directory.
5. **Se for a versão Supabase**, antes de clicar em Deploy, abra a seção **Environment Variables** e adicione:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | a Project URL do seu Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | a service_role key do seu Supabase (Project Settings → API) |

   Essas duas ficam só no Vercel, nunca no repositório — é o que permite as funções em `api/` criar logins e redefinir senhas com segurança.
6. Clique em **Deploy**. Você recebe uma URL tipo `seu-projeto.vercel.app`.

## Testando a função depois de publicado

Logado como Admin ou Gerente, vá em **Gestão de Acesso → Novo usuário**. Se der um erro de "Servidor não configurado", confira se as duas variáveis de ambiente do passo 5 estão certas (Project Settings do Vercel → Environment Variables) e se você reimplantou depois de adicioná-las (mudar env var não republica sozinho — é preciso um novo Deploy, ou basta ir em **Deployments → ⋯ → Redeploy**).

## Atualizações depois

Todo `git push` no branch principal faz o Vercel republicar sozinho.

## Sobre a chave anônima ficar pública

`SUPABASE_URL`/`SUPABASE_ANON_KEY` dentro do `js/config.js` publicado é esperado e seguro — é assim que toda aplicação Supabase client-side funciona — **desde que o Row Level Security do `supabase/schema.sql` continue ativo**. Não desative RLS em nenhuma tabela. Já a `SUPABASE_SERVICE_ROLE_KEY` (essa sim perigosa) nunca aparece em nenhum arquivo do repositório, só como variável de ambiente do Vercel, lida pela função serverless.
