// ============================================================================
// api/redefinir-senha.js — função serverless do Vercel.
// Mesma lógica de segurança da api/criar-usuario.js: confere quem está
// pedindo antes de usar a service_role key para trocar a senha de outra
// pessoa. Um usuário trocar A PRÓPRIA senha não passa por aqui — isso é
// feito direto pelo navegador com sb.auth.updateUser(), que não precisa de
// privilégio nenhum além de já estar logado.
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
    // ---- Quem está chamando? ----
    const tokenChamador = (req.headers.authorization || '').replace('Bearer ', '');
    if (!tokenChamador) { res.status(401).json({ ok: false, erro: 'Faça login novamente.' }); return; }
    const { data: userChamador, error: erroToken } = await admin.auth.getUser(tokenChamador);
    if (erroToken || !userChamador?.user) { res.status(401).json({ ok: false, erro: 'Sessão inválida. Faça login novamente.' }); return; }
    const { data: perfilChamador, error: erroPerfil } = await admin
      .from('perfis').select('papel,municipio_id').eq('id', userChamador.user.id).single();
    if (erroPerfil || !perfilChamador) { res.status(403).json({ ok: false, erro: 'Seu usuário não tem um perfil cadastrado.' }); return; }

    // ---- O que foi pedido ----
    const { usuarioIdAlvo, novaSenha } = req.body || {};
    if (!usuarioIdAlvo || !novaSenha) { res.status(400).json({ ok: false, erro: 'Faltou o usuário alvo ou a nova senha.' }); return; }
    if (novaSenha.length < 6) { res.status(400).json({ ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' }); return; }

    const { data: perfilAlvo, error: erroAlvo } = await admin
      .from('perfis').select('papel,municipio_id').eq('id', usuarioIdAlvo).single();
    if (erroAlvo || !perfilAlvo) { res.status(404).json({ ok: false, erro: 'Usuário alvo não encontrado.' }); return; }

    // ---- O chamador pode redefinir a senha desse alvo? ----
    const chamadorEhAdmin = perfilChamador.papel === 'Admin';
    const chamadorEhGerente = perfilChamador.papel === 'Gerente';
    const alvoPermitidoParaGerente = (perfilAlvo.papel === 'Coordenador' || perfilAlvo.papel === 'Colaborador')
      && perfilAlvo.municipio_id === perfilChamador.municipio_id;

    if (!chamadorEhAdmin && !(chamadorEhGerente && alvoPermitidoParaGerente)) {
      res.status(403).json({ ok: false, erro: 'Seu perfil não pode redefinir a senha desse usuário.' });
      return;
    }

    const { error: erroUpdate } = await admin.auth.admin.updateUserById(usuarioIdAlvo, { password: novaSenha });
    if (erroUpdate) { res.status(400).json({ ok: false, erro: 'Não foi possível redefinir a senha: ' + erroUpdate.message }); return; }

    res.status(200).json({ ok: true });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: 'Erro inesperado no servidor: ' + erro.message });
  }
};
