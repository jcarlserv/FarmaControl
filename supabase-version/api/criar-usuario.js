// ============================================================================
// api/criar-usuario.js — função serverless do Vercel.
// Roda no servidor (nunca no navegador), por isso pode usar a
// SUPABASE_SERVICE_ROLE_KEY com segurança — ela fica só numa variável de
// ambiente do Vercel, nunca em nenhum arquivo deste repositório.
//
// O que faz:
// 1. Confere quem está chamando (pelo token de login que o painel envia).
// 2. Confere se essa pessoa tem permissão de criar o usuário pedido
//    (Admin cria qualquer um; Gerente só Coordenador/Colaborador do
//    próprio município).
// 3. Cria o login (Supabase Auth) e a linha correspondente em "perfis".
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, erro: 'Servidor não configurado: faltam variáveis de ambiente no Vercel.' });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // ---- 1. Quem está chamando? ----
    const tokenChamador = (req.headers.authorization || '').replace('Bearer ', '');
    if (!tokenChamador) {
      res.status(401).json({ ok: false, erro: 'Faça login novamente.' });
      return;
    }
    const { data: userChamador, error: erroToken } = await admin.auth.getUser(tokenChamador);
    if (erroToken || !userChamador?.user) {
      res.status(401).json({ ok: false, erro: 'Sessão inválida. Faça login novamente.' });
      return;
    }
    const { data: perfilChamador, error: erroPerfil } = await admin
      .from('perfis').select('papel,municipio_id').eq('id', userChamador.user.id).single();
    if (erroPerfil || !perfilChamador) {
      res.status(403).json({ ok: false, erro: 'Seu usuário não tem um perfil cadastrado.' });
      return;
    }

    // ---- 2. O que foi pedido, e o chamador pode pedir isso? ----
    const { nome, email, senha, papel, municipioId, unidadeId } = req.body || {};
    if (!nome || !email || !senha || !papel) {
      res.status(400).json({ ok: false, erro: 'Preencha nome, e-mail, senha e papel.' });
      return;
    }
    if (senha.length < 6) {
      res.status(400).json({ ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }

    const chamadorEhAdmin = perfilChamador.papel === 'Admin';
    const chamadorEhGerente = perfilChamador.papel === 'Gerente';

    if (!chamadorEhAdmin && !chamadorEhGerente) {
      res.status(403).json({ ok: false, erro: 'Seu perfil não pode criar usuários.' });
      return;
    }
    if (chamadorEhGerente) {
      const papelPermitido = papel === 'Coordenador' || papel === 'Colaborador';
      const municipioPermitido = municipioId === perfilChamador.municipio_id;
      if (!papelPermitido || !municipioPermitido) {
        res.status(403).json({ ok: false, erro: 'Gerente só pode criar Coordenador/Colaborador dentro do próprio município.' });
        return;
      }
    }
    if ((papel === 'Coordenador' || papel === 'Colaborador') && !unidadeId) {
      res.status(400).json({ ok: false, erro: 'Escolha a unidade de saúde para esse papel.' });
      return;
    }
    if ((papel === 'Gerente' || papel === 'Coordenador' || papel === 'Colaborador') && !municipioId) {
      res.status(400).json({ ok: false, erro: 'Escolha o município para esse papel.' });
      return;
    }

    // ---- 3. Cria o login e o perfil ----
    const { data: novoUsuario, error: erroCriacao } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true
    });
    if (erroCriacao) {
      res.status(400).json({ ok: false, erro: 'Não foi possível criar o login: ' + erroCriacao.message });
      return;
    }

    const { error: erroInsercaoPerfil } = await admin.from('perfis').insert({
      id: novoUsuario.user.id,
      nome,
      papel,
      municipio_id: papel === 'Admin' ? null : municipioId,
      unidade_id: (papel === 'Coordenador' || papel === 'Colaborador') ? unidadeId : null
    });
    if (erroInsercaoPerfil) {
      await admin.auth.admin.deleteUser(novoUsuario.user.id); // desfaz o login criado, para não sobrar usuário "órfão"
      res.status(400).json({ ok: false, erro: 'Não foi possível salvar o perfil: ' + erroInsercaoPerfil.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: 'Erro inesperado no servidor: ' + erro.message });
  }
};
