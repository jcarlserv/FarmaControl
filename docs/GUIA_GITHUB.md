# Guia — subir este projeto para o seu repositório no GitHub

Você já tem o repositório criado. Dentro da pasta do projeto:

```bash
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git branch -M main
git add .
git commit -m "Estoque farmacêutico — versão Supabase multi-município"
git push -u origin main
```

Se o repositório no GitHub já tiver algum arquivo (ex.: um README criado na hora de criar o repo), o `push` pode recusar por histórico divergente. Nesse caso, rode antes:

```bash
git pull origin main --allow-unrelated-histories
```

resolva qualquer conflito que aparecer, depois `git push -u origin main` de novo.

## O que **não** commitar

- `CONFIG.SUPABASE_URL`/`CONFIG.SUPABASE_ANON_KEY` reais em `supabase-version/js/config.js` — se o repositório for público, é mais prudente manter esses campos vazios no repositório e colar os valores reais só na cópia que você efetivamente publica (ou usar variável de ambiente equivalente, se um dia migrar isso para dentro do processo de build).
- A **service_role key** do Supabase nunca vai em arquivo nenhum deste repositório — ela só existe como variável de ambiente no Vercel (ver `docs/GUIA_VERCEL.md`).
- Nenhuma senha real de usuário.
