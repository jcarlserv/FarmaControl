/* ============================================================================
   CAMADA DE DADOS — Supabase de verdade, ou o `demo` acima.
   ============================================================================ */
async function login(email, senha){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      const p = demo.perfis[email];
      if(!p || p.senha!==senha) return { ok:false, erro:'E-mail ou senha inválidos.' };
      return { ok:true, perfil:{ id:email, usuario:email, ...p } };
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error) return { ok:false, erro: error.message };
    const { data: perfil, error: erroPerfil } = await sb.from('perfis').select('nome,papel,municipio_id,unidade_id,ativo').eq('id', data.user.id).single();
    if(erroPerfil || !perfil) return { ok:false, erro:'Login ok, mas não achei um perfil para esse usuário na tabela "perfis".' };
    if(!perfil.ativo) return { ok:false, erro:'Este usuário está desativado.' };
    return { ok:true, token: data.session.access_token, perfil:{ id:data.user.id, usuario:email, ...perfil } };
  } finally { progOff(); }
}

async function carregarListas(){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); return demo.listas; }
    const { data, error } = await sb.from('listas_opcoes').select('lista,valor').order('id');
    if(error) throw new Error(error.message);
    const agrupado = {}; data.forEach(l=>{ (agrupado[l.lista]=agrupado[l.lista]||[]).push(l.valor); }); return agrupado;
  } finally { progOff(); }
}
async function carregarUnidades(){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); return unidadesPermitidasDemo(estado.perfil); }
    const { data, error } = await sb.from('unidades_saude').select('*').order('nome');
    if(error) throw new Error(error.message);
    return data;
  } finally { progOff(); }
}
async function carregarMunicipios(){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); return municipiosPermitidosDemo(estado.perfil); }
    const { data, error } = await sb.from('municipios').select('*').order('nome');
    if(error) throw new Error(error.message);
    return data;
  } finally { progOff(); }
}

async function listarMovimentacoes(){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      const idsPermitidos = unidadesPermitidasDemo(estado.perfil).map(u=>u.id);
      return { ok:true, registros: demo.movimentacoes.filter(m=>idsPermitidos.includes(m.unidade_id)).map(r=>({...r})) };
    }
    const { data, error } = await sb.from('movimentacoes').select('*').order('data',{ascending:false});
    if(error) return { ok:false, erro: error.message };
    return { ok:true, registros: data };
  } finally { progOff(); }
}
async function criarMovimentacao(dados){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); const novo={ id:'m'+Date.now(), ...dados }; demo.movimentacoes.push(novo); return { ok:true, registro:novo }; }
    const { data, error } = await sb.from('movimentacoes').insert(dados).select().single();
    if(error) return { ok:false, erro: error.message };
    return { ok:true, registro:data };
  } finally { progOff(); }
}
async function atualizarMovimentacao(id, dados){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); const r=demo.movimentacoes.find(m=>m.id===id); if(!r) return {ok:false,erro:'Não encontrado.'}; Object.assign(r,dados); return {ok:true,registro:r}; }
    const { data, error } = await sb.from('movimentacoes').update(dados).eq('id',id).select().single();
    if(error) return { ok:false, erro: error.message };
    return { ok:true, registro:data };
  } finally { progOff(); }
}
async function excluirMovimentacao(id){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); demo.movimentacoes = demo.movimentacoes.filter(m=>m.id!==id); return {ok:true}; }
    const { error } = await sb.from('movimentacoes').delete().eq('id',id);
    if(error) return { ok:false, erro: error.message };
    return { ok:true };
  } finally { progOff(); }
}
async function adicionarOpcaoLista(lista, valor){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); (demo.listas[lista]=demo.listas[lista]||[]).push(valor); return {ok:true}; }
    const { error } = await sb.from('listas_opcoes').insert({ lista, valor });
    if(error) return { ok:false, erro: error.message };
    return { ok:true };
  } finally { progOff(); }
}
async function removerOpcaoLista(lista, valor){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); demo.listas[lista]=(demo.listas[lista]||[]).filter(v=>v!==valor); return {ok:true}; }
    const { data, error } = await sb.from('listas_opcoes').select('id').eq('lista',lista).eq('valor',valor).single();
    if(error) return { ok:false, erro: error.message };
    const { error: erro2 } = await sb.from('listas_opcoes').delete().eq('id', data.id);
    if(erro2) return { ok:false, erro: erro2.message };
    return { ok:true };
  } finally { progOff(); }
}

function traduzErroMunicipio(error){
  if(error.code === '23505') return 'Esse município já está cadastrado (mesmo nome e UF).';
  if(error.code === '23503') return 'Não é possível excluir: existem unidades de saúde ou movimentações vinculadas a este município. Exclua ou transfira essas unidades primeiro.';
  return error.message;
}
async function criarMunicipio(nome, uf){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      if(demo.municipios.some(m => m.nome.toLowerCase()===nome.toLowerCase() && m.uf===uf)) return { ok:false, erro:'Esse município já está cadastrado (mesmo nome e UF).' };
      const novo={ id:'mun'+Date.now(), nome, uf, logo_url:null, cor_acento:null }; demo.municipios.push(novo); return {ok:true, registro:novo};
    }
    const { data, error } = await sb.from('municipios').insert({ nome, uf }).select().single();
    if(error) return { ok:false, erro: traduzErroMunicipio(error) };
    return { ok:true, registro:data };
  } finally { progOff(); }
}
async function excluirMunicipio(id){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      const temUnidade = demo.unidades.some(u => u.municipio_id === id);
      if(temUnidade) return { ok:false, erro:'Não é possível excluir: existem unidades de saúde vinculadas a este município.' };
      demo.municipios = demo.municipios.filter(m => m.id !== id);
      return { ok:true };
    }
    const { error } = await sb.from('municipios').delete().eq('id', id);
    if(error) return { ok:false, erro: traduzErroMunicipio(error) };
    return { ok:true };
  } finally { progOff(); }
}
async function criarUnidade(municipio_id, nome, tipo){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); const novo={ id:'un'+Date.now(), municipio_id, nome, tipo }; demo.unidades.push(novo); return {ok:true, registro:novo}; }
    const { data, error } = await sb.from('unidades_saude').insert({ municipio_id, nome, tipo }).select().single();
    if(error) return { ok:false, erro: error.message };
    return { ok:true, registro:data };
  } finally { progOff(); }
}

async function listarPerfis(){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      let lista = Object.entries(demo.perfis).map(([email,p])=>({ id:email, usuario:email, ...p }));
      if(estado.perfil.papel==='Gerente') lista = lista.filter(p=>p.municipio_id===estado.perfil.municipio_id);
      return { ok:true, registros:lista };
    }
    const { data, error } = await sb.from('perfis').select('id,nome,papel,municipio_id,unidade_id,ativo');
    if(error) return { ok:false, erro:error.message };
    return { ok:true, registros:data };
  } finally { progOff(); }
}

async function criarUsuario(dados){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      if(demo.perfis[dados.email]) return { ok:false, erro:'Já existe um usuário com esse e-mail (na demonstração).' };
      demo.perfis[dados.email] = { senha:dados.senha, nome:dados.nome, papel:dados.papel, municipio_id: dados.papel==='Admin'?null:dados.municipioId, unidade_id: (dados.papel==='Coordenador'||dados.papel==='Colaborador')?dados.unidadeId:null };
      return { ok:true };
    }
    try{
      const resp = await fetch('/api/criar-usuario', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+estado.token },
        body: JSON.stringify({ nome:dados.nome, email:dados.email, senha:dados.senha, papel:dados.papel, municipioId:dados.municipioId, unidadeId:dados.unidadeId })
      });
      return await resp.json();
    } catch(erro){
      return { ok:false, erro:'Não consegui falar com o servidor de criação de usuários. Isso só funciona quando o site está publicado no Vercel (não funciona no GitHub Pages). Detalhe técnico: ' + erro.message };
    }
  } finally { progOff(); }
}

/* ============================================================================
   CONFIGURAÇÕES: organização, logomarcas e senha
   ============================================================================ */
function lerArquivoComoDataUrl(arquivo){
  return new Promise((resolve,reject)=>{
    const leitor = new FileReader();
    leitor.onload = ()=>resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function carregarOrganizacao(){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); return { ...demo.organizacao }; }
    const { data, error } = await sb.from('organizacao').select('nome,logo_url,cor_acento').eq('id', true).single();
    if(error) return { nome:'Organização', logo_url:null, cor_acento:null };
    return data;
  } finally { progOff(); }
}
async function atualizarNomeOrganizacao(nome){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); demo.organizacao.nome = nome; return { ok:true }; }
    const { error } = await sb.from('organizacao').update({ nome }).eq('id', true);
    if(error) return { ok:false, erro:error.message };
    return { ok:true };
  } finally { progOff(); }
}
async function atualizarCorOrganizacao(corHex){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); demo.organizacao.cor_acento = corHex; return { ok:true }; }
    const { error } = await sb.from('organizacao').update({ cor_acento: corHex }).eq('id', true);
    if(error) return { ok:false, erro:error.message };
    return { ok:true };
  } finally { progOff(); }
}
async function atualizarCorMunicipio(municipioId, corHex){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); const m=demo.municipios.find(m=>m.id===municipioId); if(m) m.cor_acento=corHex; return { ok:true }; }
    const { error } = await sb.from('municipios').update({ cor_acento: corHex }).eq('id', municipioId);
    if(error) return { ok:false, erro:error.message };
    return { ok:true };
  } finally { progOff(); }
}

/** Aplica a cor de destaque do painel: cor do município do usuário (se tiver) > cor da organização > padrão do CSS. */
function aplicarCorDeMarca(){
  const municipioDoUsuario = estado.municipios.find(m=>m.id===estado.perfil.municipio_id);
  const cor = (municipioDoUsuario && municipioDoUsuario.cor_acento) || (estado.organizacao && estado.organizacao.cor_acento) || null;
  if(cor) document.documentElement.style.setProperty('--cor-acento', cor);
}

/* ============================================================================
   IBGE — estados e municípios oficiais (evita erro de digitação no cadastro)
   ============================================================================ */
async function carregarEstadosIBGE(){
  try{
    const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
    if(!resp.ok) throw new Error('Falha ao consultar o IBGE.');
    const dados = await resp.json();
    return dados.map(uf => ({ sigla: uf.sigla, nome: uf.nome }));
  } catch(erro){
    return null; // o chamador cai para um campo de texto normal se isso vier nulo
  }
}
async function carregarMunicipiosIBGE(uf){
  try{
    const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
    if(!resp.ok) throw new Error('Falha ao consultar o IBGE.');
    const dados = await resp.json();
    return dados.map(m => m.nome);
  } catch(erro){
    return null;
  }
}

// escopo: 'organizacao' | 'municipio' | 'unidade'. alvoId: null para organização.
async function uploadLogo(escopo, alvoId, arquivo){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      const dataUrl = await lerArquivoComoDataUrl(arquivo);
      if(escopo==='organizacao') demo.organizacao.logo_url = dataUrl;
      else if(escopo==='municipio'){ const m=demo.municipios.find(m=>m.id===alvoId); if(m) m.logo_url=dataUrl; }
      else if(escopo==='unidade'){ const u=demo.unidades.find(u=>u.id===alvoId); if(u) u.logo_url=dataUrl; }
      return { ok:true, url:dataUrl };
    }
    const ext = (arquivo.name.split('.').pop()||'png').toLowerCase();
    const caminho = escopo==='organizacao' ? `organizacao/logo-${Date.now()}.${ext}` : `${escopo}/${alvoId}/logo-${Date.now()}.${ext}`;
    const { error: erroUpload } = await sb.storage.from('logos').upload(caminho, arquivo, { upsert:true, cacheControl:'3600' });
    if(erroUpload) return { ok:false, erro: erroUpload.message };
    const { data } = sb.storage.from('logos').getPublicUrl(caminho);
    const url = data.publicUrl;
    let erroSalvar;
    if(escopo==='organizacao') erroSalvar = (await sb.from('organizacao').update({ logo_url:url }).eq('id', true)).error;
    else if(escopo==='municipio') erroSalvar = (await sb.from('municipios').update({ logo_url:url }).eq('id', alvoId)).error;
    else erroSalvar = (await sb.from('unidades_saude').update({ logo_url:url }).eq('id', alvoId)).error;
    if(erroSalvar) return { ok:false, erro: erroSalvar.message };
    return { ok:true, url };
  } finally { progOff(); }
}

async function trocarMinhaSenha(novaSenha){
  progOn();
  try{
    if(MODO_DEMO){ await atraso(); const p=demo.perfis[estado.perfil.usuario]; if(p) p.senha=novaSenha; return { ok:true }; }
    const { error } = await sb.auth.updateUser({ password: novaSenha });
    if(error) return { ok:false, erro: error.message };
    return { ok:true };
  } finally { progOff(); }
}

async function redefinirSenhaUsuario(usuarioId, novaSenha){
  progOn();
  try{
    if(MODO_DEMO){
      await atraso();
      const p = demo.perfis[usuarioId]; // no demo, o "id" do usuário é o próprio e-mail
      if(!p) return { ok:false, erro:'Usuário não encontrado.' };
      p.senha = novaSenha;
      return { ok:true };
    }
    try{
      const resp = await fetch('/api/redefinir-senha', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+estado.token },
        body: JSON.stringify({ usuarioIdAlvo: usuarioId, novaSenha })
      });
      return await resp.json();
    } catch(erro){
      return { ok:false, erro:'Não consegui falar com o servidor. Isso só funciona quando o site está publicado no Vercel (não funciona no GitHub Pages). Detalhe técnico: ' + erro.message };
    }
  } finally { progOff(); }
}

function calcularDashboardERelatorio(registros, filtros){
  const hoje=new Date(); const mes=filtros?.mes||(hoje.getMonth()+1), ano=filtros?.ano||hoje.getFullYear();
  let totalEntradasMes=0, totalSaidasMes=0;
  const porDestinoMap={}, porMaterialMesMap={}, saldoMaterialMap={}, serieMap={};
  registros.forEach(r=>{
    const d=new Date(r.data); if(isNaN(d.getTime())) return;
    const qtde=Number(r.qtde)||0; const entrada=ehEntrada(r.tipo), saida=ehSaida(r.tipo); const sinal=entrada?1:(saida?-1:0);
    if(r.material) saldoMaterialMap[r.material]=(saldoMaterialMap[r.material]||0)+sinal*qtde;
    const chave=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!serieMap[chave]) serieMap[chave]={mes:chave,entradas:0,saidas:0};
    if(entrada) serieMap[chave].entradas+=qtde; if(saida) serieMap[chave].saidas+=qtde;
    if(d.getFullYear()!==ano || (d.getMonth()+1)!==mes) return;
    if(entrada) totalEntradasMes+=qtde; if(saida) totalSaidasMes+=qtde;
    if(r.destino){ if(!porDestinoMap[r.destino]) porDestinoMap[r.destino]={destino:r.destino,entradas:0,saidas:0}; if(entrada) porDestinoMap[r.destino].entradas+=qtde; if(saida) porDestinoMap[r.destino].saidas+=qtde; }
    if(r.material){ if(!porMaterialMesMap[r.material]) porMaterialMesMap[r.material]={material:r.material,entradas:0,saidas:0}; if(entrada) porMaterialMesMap[r.material].entradas+=qtde; if(saida) porMaterialMesMap[r.material].saidas+=qtde; }
  });
  const serieMensal=Object.values(serieMap).sort((a,b)=>a.mes<b.mes?-1:1).slice(-12);
  const porMaterial=Object.values(porMaterialMesMap).map(m=>({...m, saldoAtual: saldoMaterialMap[m.material]||0})).sort((a,b)=>(b.entradas+b.saidas)-(a.entradas+a.saidas));
  return { periodo:{mes,ano}, totalEntradasMes, totalSaidasMes, saldoMes: totalEntradasMes-totalSaidasMes, serieMensal, porDestino:Object.values(porDestinoMap), porMaterial };
}
function calcularRelatorio(registros, dataInicio, dataFim, destino, material){
  const di=dataInicio?new Date(dataInicio+'T00:00:00'):null, df=dataFim?new Date(dataFim+'T23:59:59'):null;
  let resumo={entradas:0,saidas:0}; const porDestinoMap={}, porMaterialMap={}; const movimentos=[];
  registros.forEach(r=>{
    const d=new Date(r.data); if(isNaN(d.getTime())) return;
    if(di&&d<di) return; if(df&&d>df) return;
    if(destino&&r.destino!==destino) return; if(material&&r.material!==material) return;
    const qtde=Number(r.qtde)||0; const entrada=ehEntrada(r.tipo), saida=ehSaida(r.tipo);
    if(entrada) resumo.entradas+=qtde; if(saida) resumo.saidas+=qtde;
    if(r.destino){ if(!porDestinoMap[r.destino]) porDestinoMap[r.destino]={destino:r.destino,entradas:0,saidas:0}; if(entrada) porDestinoMap[r.destino].entradas+=qtde; if(saida) porDestinoMap[r.destino].saidas+=qtde; }
    if(r.material){ if(!porMaterialMap[r.material]) porMaterialMap[r.material]={material:r.material,entradas:0,saidas:0}; if(entrada) porMaterialMap[r.material].entradas+=qtde; if(saida) porMaterialMap[r.material].saidas+=qtde; }
    movimentos.push(r);
  });
  return { resumo:{...resumo, saldo:resumo.entradas-resumo.saidas},
    porDestino:Object.values(porDestinoMap).map(d=>({...d,saldo:d.entradas-d.saidas})),
    porMaterial:Object.values(porMaterialMap).map(m=>({...m,saldo:m.entradas-m.saidas})),
    movimentos };
}

