# FarmaControl

Painel de controle de entradas/saídas de estoque farmacêutico, multi-município, com Dashboard e Relatório periódico. Backend em Supabase (Postgres + Row Level Security).

## Estrutura do projeto

```
supabase-version/
├── index.html          ← HTML puro (telas/estrutura), bem enxuto
├── css/
│   └── estilo.css       ← toda a identidade visual
├── js/
│   ├── config.js         ← CONFIG, estado global, funções utilitárias
│   ├── demo.js            ← dados fictícios do modo demonstração
│   ├── dados.js            ← toda a comunicação com o Supabase (ou o demo)
│   └── telas.js             ← login, navegação, e todas as telas
├── api/
│   ├── criar-usuario.js    ← função serverless — cria usuário
│   └── redefinir-senha.js  ← função serverless — redefine senha de outro usuário
└── package.json          ← dependência da função serverless

supabase/
├── schema.sql                     ← rode primeiro (municípios, unidades, perfis, movimentações)
├── schema_v3_configuracoes.sql    ← rode depois (aditivo: logomarcas + storage)
└── schema_v4_cores.sql            ← rode por último (aditivo: cor de destaque por Organização/Município)

docs/
├── GUIA_SUPABASE.md
├── GUIA_VERCEL.md
└── GUIA_GITHUB.md
```

Os arquivos de `js/` são carregados na ordem `config.js → demo.js → dados.js → telas.js` (veja as tags `<script>` no fim do `index.html`) — são scripts simples, sem build step, então essa ordem importa.

Sem `CONFIG.SUPABASE_URL`/`SUPABASE_ANON_KEY` preenchidos (em `js/config.js`), o painel roda em **modo demonstração** — dados fictícios em memória, bom para conhecer as 4 telas de acesso antes de conectar de verdade.

## Guias

- [`docs/GUIA_SUPABASE.md`](docs/GUIA_SUPABASE.md) — rodar o schema, criar o primeiro Admin
- [`docs/GUIA_VERCEL.md`](docs/GUIA_VERCEL.md) — publicar (front-end + função serverless)
- [`docs/GUIA_GITHUB.md`](docs/GUIA_GITHUB.md) — subir este projeto para o seu GitHub

## Papéis de usuário — 4 níveis, com escopo por município/unidade

Pensado para uma organização que administra unidades de saúde (Hospital/UBS/UPA) em vários municípios:

| Papel | Escopo | Pode |
|---|---|---|
| **Admin** | todos os municípios | tudo — cadastra municípios, unidades, qualquer usuário |
| **Gerente** (nível 3) | 1 município (todas as unidades dele) | cadastra unidades e usuários (Coordenador/Colaborador) do seu município; edita/exclui movimentações do município |
| **Coordenador** (nível 2) | 1 unidade de saúde | lança, edita e exclui movimentações da sua unidade |
| **Colaborador** (nível 1) | 1 unidade de saúde | só lança movimentações (não edita/exclui) |

A tela **Configurações** cadastra municípios, unidades, usuários e logomarcas — visível a todos, mas o conteúdo muda por papel (todo mundo pode trocar a própria senha; o resto depende do nível). Detalhes de permissão linha a linha estão comentados em `supabase/schema.sql` e `supabase/schema_v3_configuracoes.sql`.

## Identidade visual

Três níveis de logomarca, cada um só editável por quem administra aquele nível — e uma cor de destaque em dois níveis:

| Item | Quem edita |
|---|---|
| Logomarca da Organização (OS) | Admin |
| Logomarca do Município | Admin, Gerente (só o seu) |
| Logomarca da Unidade de saúde | Admin, Gerente (unidades do seu município), Coordenador (só a sua) |
| Cor de destaque da Organização | Admin |
| Cor de destaque do Município (sobrescreve a da OS para quem é desse município) | Admin, Gerente (só o seu) |

Cadastro de município usa Estado (UF) → Município oficiais do IBGE, para evitar erro de digitação — se o IBGE estiver fora do ar, cai automaticamente para digitação manual.

## Menu do painel

| Item | Quem vê |
|---|---|
| Movimentação | todos |
| Relatório periódico | todos |
| Lista de opções | Admin, Gerente |
| Configurações | todos (conteúdo varia por papel) |
| Dashboard | todos |
| Sair | todos |
