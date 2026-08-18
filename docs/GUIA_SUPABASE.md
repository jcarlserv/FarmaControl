# Guia — versão Supabase (multi-município, 4 níveis de acesso)

Painel em `supabase-version/index.html`, banco em Postgres/Supabase. Hierarquia: **Município → Unidade de Saúde (Hospital/UBS/UPA) → Movimentações**, com 4 papéis: Admin, Gerente, Coordenador, Colaborador (detalhes de permissão no `README.md` e nos comentários do `supabase/schema.sql`).

## 1. Rode o schema no seu projeto Supabase

No projeto → **SQL Editor** → New query → cole o conteúdo de `supabase/schema.sql` → **Run**.

> Esse script começa com `drop table if exists ...` — se você já tinha uma versão anterior (v1) com dados de teste, isso apaga tudo antes de recriar. Se tiver dado real, faça backup antes de rodar.

Isso cria `municipios`, `unidades_saude`, `perfis`, `listas_opcoes`, `movimentacoes`, ativa Row Level Security em todas, e insere algumas opções de exemplo em `listas_opcoes`.

Depois, rode também `supabase/schema_v3_configuracoes.sql` (mesmo jeito: SQL Editor → New query → colar → Run). Esse é **aditivo** — não apaga nada — e adiciona: a tabela `organizacao` (nome + logo da OS), a coluna `logo_url` em municípios e unidades, o bucket de armazenamento `logos` e as permissões de quem pode trocar cada logo.

Por fim, rode `supabase/schema_v4_cores.sql` (também aditivo) — adiciona a coluna `cor_acento` em `organizacao` e `municipios`, usada pela cor de destaque do painel.

## 2. Crie o primeiro Admin (só uma vez, manualmente)

1. **Authentication → Users → Add user** — e-mail e senha.
2. Copie o **UUID** desse usuário.
3. No SQL Editor:
   ```sql
   insert into perfis (id, nome, papel) values ('COLE-O-UUID-AQUI', 'Seu Nome', 'Admin');
   ```

Todo o resto — municípios, unidades de saúde, e os demais usuários (Gerente, Coordenador, Colaborador) — você cadastra **de dentro do próprio painel**, logado como esse Admin, na tela **Gestão de Acesso**.

## 3. Pegue as chaves do projeto

Em **Project Settings → API**, você vai precisar de três valores, em dois lugares diferentes:

| Chave | Onde usar | Por quê |
|---|---|---|
| Project URL | `js/config.js` (`CONFIG.SUPABASE_URL`) e Vercel (`SUPABASE_URL`) | identifica seu projeto |
| anon public key | `js/config.js` (`CONFIG.SUPABASE_ANON_KEY`) | usada pelo navegador, protegida pelo RLS |
| **service_role key** | **só** como variável de ambiente no Vercel (`SUPABASE_SERVICE_ROLE_KEY`) | usada só pela função `api/criar-usuario.js`, no servidor |

⚠️ **A service_role key nunca entra em nenhum arquivo do repositório (nem em `js/config.js`).** Ela ignora todo o RLS — se vazar, alguém tem acesso total ao banco. Ela só existe como variável de ambiente no painel do Vercel (veja `docs/GUIA_VERCEL.md`).

## 4. Configure `js/config.js`

```js
const CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sua-anon-key-aqui'
};
```

Sem isso preenchido, o painel roda em modo demonstração — use `admin@demo.com / admin123` (Admin), `gerente@demo.com / gerente123` (Gerente de Sobral), `coordenador@demo.com / coord123`, `colaborador@demo.com / colab123` para conhecer as 4 visões antes de configurar de verdade.

## 5. A tela "Configurações"

Aparece no menu para todo mundo, mas o conteúdo muda por papel:

- **Todos**: trocar a própria senha.
- **Admin**: também nome/logo da Organização, logo de qualquer Município, logo de qualquer Unidade, cadastro de Municípios/Unidades/Usuários (qualquer um), e pode redefinir a senha de qualquer usuário.
- **Gerente**: também logo do seu Município, logo das Unidades do seu município, cadastro de Unidades e Usuários (Coordenador/Colaborador) do seu município, e redefine a senha desses usuários.
- **Coordenador**: também logo da sua própria Unidade.
- **Colaborador**: só a troca da própria senha.

Cadastrar usuário novo e redefinir a senha de outra pessoa chamam as funções serverless `api/criar-usuario.js` e `api/redefinir-senha.js` (ver `docs/GUIA_VERCEL.md`) — elas conferem a permissão antes de agir. Trocar a **própria** senha não passa por nenhuma função — é direto entre o navegador e o Supabase Auth.

**Login/e-mail e essas duas ações dependem de estar publicado no Vercel** (ou rodando `vercel dev` localmente) — abrir o `index.html` por duplo clique local funciona para tudo, exceto criar usuário novo e redefinir senha de outra pessoa (a troca da própria senha funciona mesmo local, se já estiver conectado ao Supabase). Para testar sem publicar, use o modo demonstração.

## 6. Próximo passo

Veja `docs/GUIA_VERCEL.md` para publicar tudo (front-end + a função de criar usuário).
