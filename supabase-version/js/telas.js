/* ============================================================================
   AUTENTICAÇÃO E NAVEGAÇÃO
   ============================================================================ */
if(MODO_DEMO){ $('#faixa-demo').style.display='block'; $('#ajuda-demo').style.display='block'; }

async function entrarNoApp(perfil, token){
  estado.perfil = perfil; estado.token = token || null;
  estado.listas = await carregarListas();
  estado.unidades = await carregarUnidades();
  estado.municipios = await carregarMunicipios();
  estado.organizacao = await carregarOrganizacao();
  aplicarCorDeMarca();
  $('#tela-login').style.display='none'; $('#app').style.display='block';
  $('#quem-esta-logado').innerHTML = `Logado como<br><strong>${escaparHtml(estado.perfil.nome)}</strong> · ${escaparHtml(estado.perfil.papel)}`
    + (estado.perfil.municipio_id ? `<br>${escaparHtml(nomeMunicipio(estado.perfil.municipio_id))}` : '')
    + (estado.perfil.unidade_id ? `<br>${escaparHtml(nomeUnidade(estado.perfil.unidade_id))}` : '');
  montarNavegacao(); abrirTela('movimentacao');
}

$('#form-login').addEventListener('submit', async () => {
  const email=$('#campo-usuario').value.trim(), senha=$('#campo-senha').value;
  const botao=$('#botao-entrar'), erroEl=$('#erro-login');
  erroEl.textContent=''; botao.disabled=true; botao.textContent='Entrando…';
  const resp = await login(email, senha);
  botao.disabled=false; botao.textContent='Entrar';
  if(!resp.ok){ erroEl.textContent = resp.erro; return; }
  await entrarNoApp(resp.perfil, resp.token);
});

/** Ao carregar a página, se já existir uma sessão do Supabase salva no navegador,
    entra direto no painel sem pedir login de novo. */
async function tentarRestaurarSessao(){
  if(MODO_DEMO) return; // modo demonstração nunca guarda sessão real
  try{
    const { data } = await sb.auth.getSession();
    const sessao = data && data.session;
    if(!sessao) return;
    const { data: perfilRow, error } = await sb.from('perfis')
      .select('nome,papel,municipio_id,unidade_id,ativo').eq('id', sessao.user.id).single();
    if(error || !perfilRow || !perfilRow.ativo){ await sb.auth.signOut(); return; }
    await entrarNoApp({ id: sessao.user.id, usuario: sessao.user.email, ...perfilRow }, sessao.access_token);
  } catch(erro){
    // Sem conexão ou sessão inválida — sem problema, só mostra a tela de login normalmente.
  }
}
tentarRestaurarSessao();

function sair(){
  if(estado.dashboard.timer) clearInterval(estado.dashboard.timer);
  if(estado.abaTimer) clearInterval(estado.abaTimer);
  if(!MODO_DEMO) sb.auth.signOut();
  Object.assign(estado, { token:null, perfil:null, listas:{}, unidades:[], municipios:[], organizacao:null, cacheMovimentacoes:[] });
  $('#app').style.display='none'; $('#tela-login').style.display='flex';
  $('#campo-usuario').value=''; $('#campo-senha').value='';
}

function montarNavegacao(){
  const podeGerirAcesso = estado.perfil.papel==='Admin' || estado.perfil.papel==='Gerente';
  const itens = [
    { id:'movimentacao', rotulo:'📋 Movimentação' },
    { id:'relatorio', rotulo:'📅 Relatório periódico' }
  ];
  if(podeGerirAcesso) itens.push({ id:'listas', rotulo:'🏷️ Lista de opções' });
  itens.push({ id:'config', rotulo:'⚙️ Configurações' });
  itens.push({ id:'dashboard', rotulo:'📊 Dashboard' });
  $('#itens-navegacao').innerHTML = itens.map(it=>`<button class="nav-item" data-tela="${it.id}">${it.rotulo}</button>`).join('') + `<button class="nav-item" id="botao-sair">🚪 Sair</button>`;
  $all('.nav-item[data-tela]').forEach(b=>b.addEventListener('click', ()=>abrirTela(b.dataset.tela)));
  $('#botao-sair').addEventListener('click', sair);
}
function marcarNavAtiva(id){ $all('.nav-item[data-tela]').forEach(b=>b.classList.toggle('ativo', b.dataset.tela===id)); }

function abrirTela(id){
  if(estado.dashboard.timer && id!=='dashboard'){ clearInterval(estado.dashboard.timer); estado.dashboard.timer=null; }
  if(estado.abaTimer && id!=='movimentacao'){ clearInterval(estado.abaTimer); estado.abaTimer=null; }
  marcarNavAtiva(id);
  const raiz=$('#conteudo-principal');
  if(id==='movimentacao') return renderizarMovimentacao(raiz);
  if(id==='relatorio') return renderizarRelatorio(raiz);
  if(id==='listas') return renderizarListas(raiz);
  if(id==='config') return renderizarConfiguracoes(raiz);
  if(id==='dashboard') return renderizarDashboard(raiz);
}

/* ============================================================================
   TELA: MOVIMENTAÇÃO
   ============================================================================ */
async function renderizarMovimentacao(raiz){
  raiz.innerHTML = `
    <div class="cabecalho-tela"><div><h1>Movimentação</h1><p>Lançamentos de entrada e saída de estoque${estado.perfil.papel!=='Admin'&&estado.perfil.papel!=='Gerente' ? ' — '+escaparHtml(nomeUnidade(estado.perfil.unidade_id)) : ''}.</p></div>
      <button class="botao botao-primario" id="botao-novo">+ Novo registro</button></div>
    <div class="ficha">
      <div class="barra-ferramentas">
        <button class="botao botao-fantasma" id="botao-atualizar-mov">↻ Atualizar</button>
        <span class="badge-atualizacao" id="badge-mov"><span class="ponto-status"></span> —</span>
        <input type="text" id="busca-mov" placeholder="Buscar…" style="max-width:220px; padding:8px 12px; border:1px solid var(--cor-borda); border-radius:8px;">
        <span class="flex-1"></span>
        <label class="toggle"><input type="checkbox" id="toggle-auto-mov"> Atualizar automaticamente</label>
        <select id="intervalo-auto-mov" style="padding:6px 8px; border:1px solid var(--cor-borda); border-radius:6px;">
          <option value="1">a cada 1 min</option><option value="5" selected>a cada 5 min</option><option value="10">a cada 10 min</option>
        </select>
      </div>
      <div class="aviso-discreto" id="aviso-mov"></div>
      <div class="tabela-scroll"><div id="tabela-mov">Carregando…</div></div>
    </div>`;
  $('#botao-novo').addEventListener('click', ()=>abrirModal(null));
  $('#busca-mov').addEventListener('input', e=>desenharTabelaMov(e.target.value));
  $('#botao-atualizar-mov').addEventListener('click', ()=>buscarMovimentacoes(true));
  $('#toggle-auto-mov').addEventListener('change', e=>{
    if(estado.abaTimer){ clearInterval(estado.abaTimer); estado.abaTimer=null; }
    if(e.target.checked) estado.abaTimer=setInterval(()=>buscarMovimentacoes(false), Number($('#intervalo-auto-mov').value)*60000);
  });
  $('#intervalo-auto-mov').addEventListener('change', ()=>{
    if($('#toggle-auto-mov').checked){ clearInterval(estado.abaTimer); estado.abaTimer=setInterval(()=>buscarMovimentacoes(false), Number($('#intervalo-auto-mov').value)*60000); }
  });
  buscarMovimentacoes(true);
}
async function buscarMovimentacoes(mostrarCarregando){
  const badge=$('#badge-mov'), aviso=$('#aviso-mov'); if(!badge) return;
  if(mostrarCarregando) badge.innerHTML='<span class="ponto-status carregando"></span> Atualizando…';
  const resp = await listarMovimentacoes();
  if(!$('#badge-mov')) return;
  if(!resp.ok){ aviso.style.display='block'; aviso.textContent='⚠ Não foi possível atualizar agora ('+resp.erro+'). Mostrando os últimos dados carregados.'; badge.innerHTML='<span class="ponto-status erro"></span> Falha na última atualização'; if(!estado.cacheMovimentacoes.length) $('#tabela-mov').innerHTML='<div class="vazio">Sem dados ainda.</div>'; return; }
  aviso.style.display='none'; estado.cacheMovimentacoes = resp.registros;
  badge.innerHTML='<span class="ponto-status"></span> Última atualização às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  desenharTabelaMov($('#busca-mov')?$('#busca-mov').value:'');
}
function desenharTabelaMov(filtro){
  const alvo=$('#tabela-mov'); let regs=estado.cacheMovimentacoes;
  if(filtro){ const f=filtro.toLowerCase(); regs=regs.filter(r=>COLUNAS_MOVIMENTACAO.some(c=>String(formatarValorBusca(r,c)).toLowerCase().includes(f))); }
  if(regs.length===0){ alvo.innerHTML='<div class="vazio">Nenhum registro encontrado.</div>'; return; }
  const podeEditar = estado.perfil.papel!=='Colaborador';
  alvo.innerHTML = `<table><thead><tr>${COLUNAS_MOVIMENTACAO.map(c=>`<th>${c.nome}</th>`).join('')}${podeEditar?'<th></th>':''}</tr></thead><tbody>
    ${regs.map(r=>`<tr>${COLUNAS_MOVIMENTACAO.map(c=>`<td>${formatarCelula(r,c)}</td>`).join('')}
      ${podeEditar?`<td class="acoes-linha"><button data-ed="${r.id}">Editar</button><button data-ex="${r.id}">Excluir</button></td>`:''}</tr>`).join('')}
    </tbody></table>`;
  if(podeEditar){
    $all('button[data-ed]',alvo).forEach(b=>b.addEventListener('click',()=>abrirModal(regs.find(r=>r.id===b.dataset.ed))));
    $all('button[data-ex]',alvo).forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Excluir este registro?')) return;
      const resp = await excluirMovimentacao(b.dataset.ex);
      if(!resp.ok){ alert(resp.erro); return; }
      estado.cacheMovimentacoes = estado.cacheMovimentacoes.filter(r=>r.id!==b.dataset.ex);
      desenharTabelaMov($('#busca-mov').value);
    }));
  }
}
function formatarValorBusca(r,c){ return c.campo==='unidade_id' ? nomeUnidade(r.unidade_id) : r[c.campo]; }
function formatarCelula(r, coluna){
  const valor = r[coluna.campo];
  if(coluna.tipo==='unidade') return escaparHtml(nomeUnidade(valor));
  if(coluna.tipo==='data') return escaparHtml(formatarData(valor));
  if(coluna.campo==='tipo'){ const cls=ehEntrada(valor)?'entrada':(ehSaida(valor)?'saida':''); return `<span class="rotulo-es ${cls}">${escaparHtml(valor)}</span>`; }
  return escaparHtml(valor);
}
function abrirModal(registro){
  $('#titulo-modal').textContent = registro? 'Editar registro' : 'Novo registro';
  $('#erro-modal').textContent='';
  const podeEscolherUnidade = estado.perfil.papel==='Admin' || estado.perfil.papel==='Gerente';
  $('#form-modal').innerHTML = COLUNAS_MOVIMENTACAO.map(c=>{
    let valor;
    if(registro) valor = registro[c.campo];
    else if(c.campo==='data') valor = new Date().toISOString();
    else if(c.campo==='unidade_id') valor = estado.perfil.unidade_id || (estado.unidades[0]&&estado.unidades[0].id) || '';
    else valor='';
    const id='campo-'+c.campo;
    let html;
    if(c.tipo==='unidade'){
      if(podeEscolherUnidade){
        html = `<select id="${id}">${estado.unidades.map(u=>`<option value="${u.id}" ${String(valor)===u.id?'selected':''}>${escaparHtml(u.nome)} (${u.tipo})</option>`).join('')}</select>`;
      } else {
        html = `<input type="text" value="${escaparHtml(nomeUnidade(valor))}" disabled><input type="hidden" id="${id}" value="${valor}">`;
      }
    } else if(c.tipo==='select'){
      const opcoes = estado.listas[c.lista]||[];
      html = `<select id="${id}"><option value=""></option>${opcoes.map(o=>`<option value="${escaparHtml(o)}" ${String(valor)===String(o)?'selected':''}>${escaparHtml(o)}</option>`).join('')}</select>`;
    } else if(c.tipo==='numero'){ html = `<input id="${id}" type="number" step="any" value="${escaparHtml(valor)}">`; }
    else if(c.tipo==='data'){ html = `<input id="${id}" type="date" value="${paraInputData(valor)}">`; }
    else { html = `<input id="${id}" type="text" value="${escaparHtml(valor)}">`; }
    return `<div class="campo"><label for="${id}">${c.nome}</label>${html}</div>`;
  }).join('');
  estado._editandoId = registro? registro.id : null;
  estado._novoUsuarioModal = false;
  estado._redefinirSenhaId = null;
  $('#sobreposicao-modal').style.display='flex';
}
$('#botao-cancelar-modal').addEventListener('click', ()=>$('#sobreposicao-modal').style.display='none');
$('#sobreposicao-modal').addEventListener('click', e=>{ if(e.target.id==='sobreposicao-modal') $('#sobreposicao-modal').style.display='none'; });
$('#botao-salvar-modal').addEventListener('click', async ()=>{
  if(estado._novoUsuarioModal){ await salvarNovoUsuario(); return; }
  if(estado._redefinirSenhaId){ await salvarRedefinicaoSenha(); return; }
  const dados={};
  COLUNAS_MOVIMENTACAO.forEach(c=>{
    const el=document.getElementById('campo-'+c.campo); if(!el) return;
    if(c.tipo==='data'){ dados[c.campo]=el.value||null; return; }
    if(c.tipo==='numero'){ dados[c.campo]=el.value===''?null:Number(el.value); return; }
    dados[c.campo]=el.value;
  });
  const botao=$('#botao-salvar-modal'); botao.disabled=true; botao.textContent='Salvando…';
  const resp = estado._editandoId ? await atualizarMovimentacao(estado._editandoId, dados) : await criarMovimentacao(dados);
  botao.disabled=false; botao.textContent='Salvar';
  if(!resp.ok){ $('#erro-modal').textContent = resp.erro; return; }
  $('#sobreposicao-modal').style.display='none';
  if(estado._editandoId){ const i=estado.cacheMovimentacoes.findIndex(r=>r.id===estado._editandoId); if(i!==-1) estado.cacheMovimentacoes[i]=resp.registro; }
  else estado.cacheMovimentacoes.unshift(resp.registro);
  if($('#tabela-mov')) desenharTabelaMov($('#busca-mov')?$('#busca-mov').value:'');
});

async function salvarNovoUsuario(){
  const nome=$('#nu-nome').value.trim(), email=$('#nu-email').value.trim(), senha=$('#nu-senha').value;
  const papel=$('#nu-papel').value;
  const municipioId = $('#nu-municipio') && $('#campo-nu-municipio').style.display!=='none' ? $('#nu-municipio').value : null;
  const unidadeId = $('#nu-unidade') && $('#campo-nu-unidade').style.display!=='none' ? $('#nu-unidade').value : null;
  if(!nome||!email||!senha) { $('#erro-modal').textContent = 'Preencha nome, e-mail e senha.'; return; }
  const botao=$('#botao-salvar-modal'); botao.disabled=true; botao.textContent='Criando…';
  const resp = await criarUsuario({ nome, email, senha, papel, municipioId, unidadeId });
  botao.disabled=false; botao.textContent='Salvar';
  if(!resp.ok){ $('#erro-modal').textContent = resp.erro; return; }
  $('#sobreposicao-modal').style.display='none';
  await carregarEDesenharUsuarios();
}

async function salvarRedefinicaoSenha(){
  const s1=$('#rs-senha').value, s2=$('#rs-senha-conf').value;
  if(s1.length<6){ $('#erro-modal').textContent='A senha precisa ter pelo menos 6 caracteres.'; return; }
  if(s1!==s2){ $('#erro-modal').textContent='As senhas não coincidem.'; return; }
  const botao=$('#botao-salvar-modal'); botao.disabled=true; botao.textContent='Salvando…';
  const resp = await redefinirSenhaUsuario(estado._redefinirSenhaId, s1);
  botao.disabled=false; botao.textContent='Salvar';
  if(!resp.ok){ $('#erro-modal').textContent = resp.erro; return; }
  $('#sobreposicao-modal').style.display='none';
}

/* ============================================================================
   TELA: DASHBOARD
   ============================================================================ */
function renderizarDashboard(raiz){
  raiz.innerHTML = `
    <div class="cabecalho-tela"><div><h1>Dashboard</h1><p>Visão geral das entradas e saídas de estoque dentro do seu escopo de acesso.</p></div></div>
    <div class="ficha">
      <div class="barra-ferramentas">
        <button class="botao botao-fantasma" id="botao-atualizar-dash">↻ Atualizar dados</button>
        <span class="badge-atualizacao" id="badge-dash"><span class="ponto-status"></span> —</span>
        <span class="flex-1"></span>
        <label class="toggle"><input type="checkbox" id="toggle-auto-dash"> Atualizar automaticamente</label>
        <select id="intervalo-auto-dash" style="padding:6px 8px; border:1px solid var(--cor-borda); border-radius:6px;">
          <option value="1">a cada 1 min</option><option value="5" selected>a cada 5 min</option><option value="10">a cada 10 min</option>
        </select>
      </div>
      <div class="aviso-discreto" id="aviso-dash"></div>
      <div id="corpo-dash">Carregando…</div>
    </div>`;
  $('#botao-atualizar-dash').addEventListener('click', ()=>buscarDashboard(true));
  $('#toggle-auto-dash').addEventListener('change', e=>{
    estado.dashboard.autoAtualizar=e.target.checked;
    if(estado.dashboard.timer){ clearInterval(estado.dashboard.timer); estado.dashboard.timer=null; }
    if(e.target.checked) estado.dashboard.timer=setInterval(()=>buscarDashboard(false), Number($('#intervalo-auto-dash').value)*60000);
  });
  $('#intervalo-auto-dash').addEventListener('change', ()=>{
    if(estado.dashboard.autoAtualizar){ clearInterval(estado.dashboard.timer); estado.dashboard.timer=setInterval(()=>buscarDashboard(false), Number($('#intervalo-auto-dash').value)*60000); }
  });
  if(estado.dashboard.dados) desenharDashboard(estado.dashboard.dados);
  buscarDashboard(estado.dashboard.dados===null);
}
async function buscarDashboard(mostrarCarregando){
  const badge=$('#badge-dash'), aviso=$('#aviso-dash'); if(!badge) return;
  if(mostrarCarregando) badge.innerHTML='<span class="ponto-status carregando"></span> Atualizando…';
  const resp = await listarMovimentacoes();
  if(!$('#badge-dash')) return;
  if(!resp.ok){ aviso.style.display='block'; aviso.textContent='⚠ Não foi possível atualizar agora ('+resp.erro+'). Mostrando os últimos dados carregados.'; badge.innerHTML='<span class="ponto-status erro"></span> Falha na última atualização'; return; }
  aviso.style.display='none';
  const dados = calcularDashboardERelatorio(resp.registros, {});
  estado.dashboard.dados = dados;
  badge.innerHTML='<span class="ponto-status"></span> Última atualização às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  desenharDashboard(dados);
}
function desenharDashboard(d){
  const corpo=$('#corpo-dash'); if(!corpo) return;
  const max=Math.max(1, ...d.serieMensal.flatMap(m=>[m.entradas,m.saidas]));
  corpo.innerHTML = `
    <div class="grade-kpis">
      <div class="kpi entrada"><div class="rotulo">Entradas no mês</div><div class="valor">${d.totalEntradasMes.toLocaleString('pt-BR')}</div></div>
      <div class="kpi saida"><div class="rotulo">Saídas no mês</div><div class="valor">${d.totalSaidasMes.toLocaleString('pt-BR')}</div></div>
      <div class="kpi"><div class="rotulo">Saldo do mês</div><div class="valor">${d.saldoMes.toLocaleString('pt-BR')}</div></div>
    </div>
    <h3>Entradas x Saídas por mês</h3>
    <div class="grafico-mensal">${d.serieMensal.map(m=>`
      <div class="grafico-coluna"><div class="grafico-barras">
        <div class="grafico-barra entrada" style="height:${Math.round(m.entradas/max*140)}px" title="Entradas: ${m.entradas}"></div>
        <div class="grafico-barra saida" style="height:${Math.round(m.saidas/max*140)}px" title="Saídas: ${m.saidas}"></div>
      </div><div class="grafico-legenda-mes">${nomeDoMes(m.mes)}</div></div>`).join('') || '<p class="vazio">Sem movimentações ainda.</p>'}</div>
    <div class="legenda-inline"><span><i class="ponto-legenda" style="background:var(--cor-entrada)"></i>Entradas</span><span><i class="ponto-legenda" style="background:var(--cor-saida)"></i>Saídas</span></div>
    <div class="duas-colunas" style="margin-top:22px;">
      <div><h3>Movimentação do mês por destino (setor)</h3><div class="tabela-scroll">${tabelaSimples(['Destino','Entradas','Saídas'], d.porDestino.map(x=>[x.destino,x.entradas,x.saidas]))}</div></div>
      <div><h3>Por material (e saldo atual)</h3><div class="tabela-scroll">${tabelaSimples(['Material','Entradas no mês','Saídas no mês','Saldo atual'], d.porMaterial.map(x=>[x.material,x.entradas,x.saidas,x.saldoAtual]))}</div></div>
    </div>`;
}
function tabelaSimples(cab, linhas){
  if(linhas.length===0) return '<p class="vazio">Sem dados no período.</p>';
  return `<table><thead><tr>${cab.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map(l=>`<tr>${l.map(v=>`<td>${typeof v==='number'?v.toLocaleString('pt-BR'):escaparHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ============================================================================
   TELA: RELATÓRIO PERIÓDICO
   ============================================================================ */
function renderizarRelatorio(raiz){
  const opcoesDestino=estado.listas['Destino']||[], opcoesMaterial=estado.listas['Material']||[];
  const hoje=new Date(); const primeiroDia=new Date(hoje.getFullYear(),hoje.getMonth(),1).toISOString().slice(0,10); const hojeISO=hoje.toISOString().slice(0,10);
  raiz.innerHTML = `
    <div class="cabecalho-tela"><div><h1>Relatório periódico</h1><p>Entradas, saídas e saldo em um intervalo de datas, por setor e por material — dentro do seu escopo de acesso.</p></div></div>
    <div class="ficha">
      <div class="barra-ferramentas" style="flex-wrap:wrap;">
        <div class="campo" style="margin:0;"><label>De</label><input type="date" id="rel-ini" value="${primeiroDia}"></div>
        <div class="campo" style="margin:0;"><label>Até</label><input type="date" id="rel-fim" value="${hojeISO}"></div>
        <div class="campo" style="margin:0; min-width:180px;"><label>Destino</label><select id="rel-dest"><option value="">Todos</option>${opcoesDestino.map(o=>`<option>${escaparHtml(o)}</option>`).join('')}</select></div>
        <div class="campo" style="margin:0; min-width:180px;"><label>Material</label><select id="rel-mat"><option value="">Todos</option>${opcoesMaterial.map(o=>`<option>${escaparHtml(o)}</option>`).join('')}</select></div>
        <button class="botao botao-primario" id="rel-buscar" style="align-self:flex-end;">Gerar relatório</button>
      </div>
      <div class="aviso-discreto" id="rel-aviso"></div>
      <div id="rel-corpo">Escolha um período e clique em "Gerar relatório".</div>
    </div>`;
  $('#rel-buscar').addEventListener('click', buscarRelatorio);
  buscarRelatorio();
}
async function buscarRelatorio(){
  const botao=$('#rel-buscar'), aviso=$('#rel-aviso'), corpo=$('#rel-corpo');
  botao.disabled=true; botao.textContent='Gerando…'; aviso.style.display='none';
  const resp = await listarMovimentacoes();
  botao.disabled=false; botao.textContent='Gerar relatório';
  if(!resp.ok){ aviso.style.display='block'; aviso.textContent='⚠ '+resp.erro; return; }
  const r = calcularRelatorio(resp.registros, $('#rel-ini').value, $('#rel-fim').value, $('#rel-dest').value, $('#rel-mat').value);
  corpo.innerHTML = `
    <div class="grade-kpis">
      <div class="kpi entrada"><div class="rotulo">Entradas no período</div><div class="valor">${r.resumo.entradas.toLocaleString('pt-BR')}</div></div>
      <div class="kpi saida"><div class="rotulo">Saídas no período</div><div class="valor">${r.resumo.saidas.toLocaleString('pt-BR')}</div></div>
      <div class="kpi"><div class="rotulo">Saldo do período</div><div class="valor">${r.resumo.saldo.toLocaleString('pt-BR')}</div></div>
    </div>
    <div class="duas-colunas">
      <div><h3>Por setor (Destino)</h3><div class="tabela-scroll">${tabelaSimples(['Destino','Entradas','Saídas','Saldo'], r.porDestino.map(x=>[x.destino,x.entradas,x.saidas,x.saldo]))}</div></div>
      <div><h3>Por material</h3><div class="tabela-scroll">${tabelaSimples(['Material','Entradas','Saídas','Saldo'], r.porMaterial.map(x=>[x.material,x.entradas,x.saidas,x.saldo]))}</div></div>
    </div>
    <h3 style="margin-top:22px;">Movimentações do período (${r.movimentos.length})</h3>
    <div class="tabela-scroll">${r.movimentos.length===0?'<p class="vazio">Nenhuma movimentação nesse período/filtro.</p>':
      `<table><thead><tr>${COLUNAS_MOVIMENTACAO.map(c=>`<th>${c.nome}</th>`).join('')}</tr></thead><tbody>
        ${r.movimentos.map(m=>`<tr>${COLUNAS_MOVIMENTACAO.map(c=>`<td>${formatarCelula(m,c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`}</div>`;
}

/* ============================================================================
   TELA: LISTA DE OPÇÕES (Admin/Gerente)
   ============================================================================ */
function renderizarListas(raiz){
  raiz.innerHTML = `
    <div class="cabecalho-tela"><div><h1>Lista de opções</h1><p>Alimentam os menus suspensos do formulário de movimentação (válidas para todos os municípios).</p></div></div>
    <div class="ficha">${Object.keys(estado.listas).map(nome=>`
      <div style="margin-bottom:20px;">
        <h3>${escaparHtml(nome)}</h3>
        <div id="chips-${cssId(nome)}">${chips(nome, estado.listas[nome])}</div>
        <div style="display:flex; gap:8px; margin-top:8px; max-width:360px;">
          <input type="text" id="novo-${cssId(nome)}" placeholder="Nova opção para ${escaparHtml(nome)}" style="flex:1; padding:8px 10px; border:1px solid var(--cor-borda); border-radius:8px;">
          <button class="botao botao-fantasma" data-add="${escaparHtml(nome)}">Adicionar</button>
        </div>
      </div>`).join('')}</div>`;
  $all('button[data-add]').forEach(b=>b.addEventListener('click', async ()=>{
    const nome=b.dataset.add; const input=document.getElementById('novo-'+cssId(nome)); const valor=input.value.trim(); if(!valor) return;
    b.disabled=true; const resp=await adicionarOpcaoLista(nome, valor); b.disabled=false;
    if(!resp.ok){ alert(resp.erro); return; }
    (estado.listas[nome]=estado.listas[nome]||[]).push(valor); input.value='';
    document.getElementById('chips-'+cssId(nome)).innerHTML=chips(nome, estado.listas[nome]); ligarRemover(nome);
  }));
  Object.keys(estado.listas).forEach(ligarRemover);
}
function cssId(t){ return String(t).toLowerCase().replace(/[^a-z0-9]/g,''); }
function chips(nome, opcoes){ if(!opcoes||opcoes.length===0) return '<span class="vazio" style="padding:6px 0;">Nenhuma opção cadastrada ainda.</span>';
  return opcoes.map(o=>`<span class="chip-lista">${escaparHtml(o)}<button data-rm="${escaparHtml(nome)}" data-v="${escaparHtml(o)}" title="Remover">×</button></span>`).join(''); }
function ligarRemover(nome){
  $all(`button[data-rm="${nome}"]`).forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Remover "'+b.dataset.v+'" da lista "'+nome+'"?')) return;
    const resp=await removerOpcaoLista(nome, b.dataset.v);
    if(!resp.ok){ alert(resp.erro); return; }
    estado.listas[nome]=estado.listas[nome].filter(v=>v!==b.dataset.v);
    document.getElementById('chips-'+cssId(nome)).innerHTML=chips(nome, estado.listas[nome]); ligarRemover(nome);
  }));
}

/* ============================================================================
   TELA: CONFIGURAÇÕES
   Todo mundo vê "Minha conta" (trocar a própria senha).
   Admin: também vê Organização (nome+logo), Municípios, Unidades, Usuários.
   Gerente: também vê logo do seu Município, Unidades do seu município,
            Usuários do seu município (cadastro + redefinir senha).
   Coordenador: também vê logo da sua própria Unidade.
   Colaborador: só "Minha conta".
   ============================================================================ */
async function renderizarConfiguracoes(raiz){
  const papel = estado.perfil.papel;
  const ehAdmin = papel==='Admin', ehGerente = papel==='Gerente', ehCoordenador = papel==='Coordenador';
  const podeGerirAcesso = ehAdmin || ehGerente;
  const meuMunicipio = estado.municipios.find(m=>m.id===estado.perfil.municipio_id);
  const minhaUnidadeObj = estado.unidades.find(u=>u.id===estado.perfil.unidade_id);

  raiz.innerHTML = `
    <div class="cabecalho-tela"><div><h1>Configurações</h1><p>Sua conta e, conforme seu perfil, identidade visual e cadastros de acesso.</p></div></div>

    <div class="ficha">
      <h2>Minha conta</h2>
      <p style="color:var(--cor-tinta-suave); font-size:13.5px; margin-top:-6px;">${escaparHtml(estado.perfil.nome)} · ${escaparHtml(estado.perfil.usuario)}</p>
      <div class="campo" style="max-width:320px;"><label>Nova senha</label><input type="password" id="minha-nova-senha" placeholder="mínimo 6 caracteres"></div>
      <div class="campo" style="max-width:320px;"><label>Confirmar nova senha</label><input type="password" id="minha-nova-senha-conf"></div>
      <div class="erro-form" id="erro-minha-senha"></div>
      <button class="botao botao-primario" id="botao-trocar-minha-senha">Salvar nova senha</button>
    </div>

    ${ehAdmin ? `
    <div class="ficha">
      <h2>Organização</h2>
      <div class="campo" style="max-width:320px;"><label>Nome da organização</label><input type="text" id="org-nome" value="${escaparHtml(estado.organizacao?.nome||'')}"></div>
      <button class="botao botao-fantasma" id="botao-salvar-nome-org">Salvar nome</button>
      <h3 style="margin-top:18px;">Logomarca</h3>
      ${blocoLogo('org', estado.organizacao?.logo_url)}
      <h3 style="margin-top:18px;">Cor de destaque padrão</h3>
      <p style="color:var(--cor-tinta-suave); font-size:13px; margin:2px 0 0;">Usada em todo o sistema, exceto onde um município tiver a própria cor.</p>
      ${blocoCor('org', estado.organizacao?.cor_acento)}
    </div>` : ''}

    ${(ehAdmin || ehGerente) ? `
    <div class="ficha">
      <h2>Municípios</h2>
      ${ehAdmin ? `
      <div id="area-cadastro-municipio" style="display:flex; gap:8px; margin-bottom:14px; max-width:520px; flex-wrap:wrap; align-items:flex-end;">
        <div class="campo" style="margin:0; min-width:160px;"><label>Estado (UF)</label><select id="novo-municipio-uf"><option value="">Carregando…</option></select></div>
        <div class="campo" style="margin:0; min-width:220px;"><label>Município</label><select id="novo-municipio-nome" disabled><option value="">Escolha o estado primeiro</option></select></div>
        <button class="botao botao-fantasma" id="botao-add-municipio">+ Adicionar município</button>
      </div>
      <div class="tabela-scroll"><div id="tabela-municipios">Carregando…</div></div>
      <h3 style="margin-top:18px;">Logomarca e cor por município</h3>
      <div class="campo" style="max-width:320px;"><label>Qual município</label><select id="logo-municipio-select">${estado.municipios.map(m=>`<option value="${m.id}">${escaparHtml(m.nome)}</option>`).join('')}</select></div>
      <div id="area-logo-municipio"></div>
      <div id="area-cor-municipio"></div>` : `
      <p style="color:var(--cor-tinta-suave); font-size:13.5px; margin-top:-6px;">${meuMunicipio ? escaparHtml(meuMunicipio.nome)+' ('+escaparHtml(meuMunicipio.uf)+')' : '—'} — cadastro de novos municípios é feito só pelo Admin.</p>
      <h3 style="margin-top:18px;">Logomarca do seu município</h3>
      ${blocoLogo('mun', meuMunicipio?.logo_url)}
      <h3 style="margin-top:18px;">Cor de destaque do seu município</h3>
      <p style="color:var(--cor-tinta-suave); font-size:13px; margin:2px 0 0;">Sobrescreve a cor da organização só para quem é desse município.</p>
      ${blocoCor('mun', meuMunicipio?.cor_acento)}`}
    </div>` : ''}

    ${podeGerirAcesso ? `
    <div class="ficha">
      <h2>Unidades de saúde${ehAdmin?'':' do seu município'}</h2>
      <div style="display:flex; gap:8px; margin-bottom:14px; max-width:600px; flex-wrap:wrap;">
        ${ehAdmin ? `<select id="nova-unidade-municipio" style="flex:1; min-width:160px; padding:8px 10px; border:1px solid var(--cor-borda); border-radius:8px;"></select>` : ''}
        <input type="text" id="nova-unidade-nome" placeholder="Nome da unidade" style="flex:2; min-width:160px; padding:8px 10px; border:1px solid var(--cor-borda); border-radius:8px;">
        <select id="nova-unidade-tipo" style="padding:8px 10px; border:1px solid var(--cor-borda); border-radius:8px;">
          <option>Hospital</option><option>UBS</option><option>UPA</option>
        </select>
        <button class="botao botao-fantasma" id="botao-add-unidade">+ Adicionar unidade</button>
      </div>
      <div class="tabela-scroll"><div id="tabela-unidades">Carregando…</div></div>
      <h3 style="margin-top:18px;">Logomarca por unidade</h3>
      <div class="campo" style="max-width:320px;"><label>Qual unidade</label><select id="logo-unidade-select">${estado.unidades.map(u=>`<option value="${u.id}">${escaparHtml(u.nome)}</option>`).join('')}</select></div>
      <div id="area-logo-unidade"></div>
    </div>

    <div class="ficha">
      <h2>Usuários${ehAdmin?'':' do seu município'}</h2>
      <div class="tabela-scroll"><div id="tabela-usuarios">Carregando…</div></div>
      <button class="botao botao-primario" id="botao-novo-usuario" style="margin-top:12px;">+ Novo usuário</button>
    </div>` : (ehCoordenador ? `
    <div class="ficha">
      <h2>Unidade de saúde</h2>
      <p style="color:var(--cor-tinta-suave); font-size:13.5px; margin-top:-6px;">${minhaUnidadeObj ? escaparHtml(minhaUnidadeObj.nome) : '—'}</p>
      <h3 style="margin-top:18px;">Logomarca da sua unidade</h3>
      ${blocoLogo('uni', minhaUnidadeObj?.logo_url)}
    </div>` : '')}`;

  // --- Minha conta ---
  $('#botao-trocar-minha-senha').addEventListener('click', async ()=>{
    const s1=$('#minha-nova-senha').value, s2=$('#minha-nova-senha-conf').value;
    const erroEl=$('#erro-minha-senha'); erroEl.textContent='';
    if(s1.length<6){ erroEl.textContent='A senha precisa ter pelo menos 6 caracteres.'; return; }
    if(s1!==s2){ erroEl.textContent='As senhas não coincidem.'; return; }
    const botao=$('#botao-trocar-minha-senha'); botao.disabled=true; botao.textContent='Salvando…';
    const resp = await trocarMinhaSenha(s1);
    botao.disabled=false; botao.textContent='Salvar nova senha';
    if(!resp.ok){ erroEl.textContent=resp.erro; return; }
    $('#minha-nova-senha').value=''; $('#minha-nova-senha-conf').value='';
    erroEl.style.color='var(--cor-entrada)'; erroEl.textContent='Senha atualizada.';
  });

  // --- Organização (Admin) ---
  if(ehAdmin){
    ligarBlocoLogo('org', async (arquivo)=>uploadLogo('organizacao', null, arquivo));
    ligarBlocoCor('org', async (cor)=>atualizarCorOrganizacao(cor), (cor)=>{ estado.organizacao.cor_acento = cor; });
    $('#botao-salvar-nome-org').addEventListener('click', async ()=>{
      const botao=$('#botao-salvar-nome-org'); botao.disabled=true;
      const resp = await atualizarNomeOrganizacao($('#org-nome').value.trim());
      botao.disabled=false;
      if(!resp.ok) alert(resp.erro); else { estado.organizacao.nome = $('#org-nome').value.trim(); }
    });
  }

  // --- Municípios (cadastro Admin via IBGE, logo/cor Admin ou Gerente) ---
  if(ehAdmin){
    desenharMunicipios();
    const trocarBlocoMunicipioSelecionado = ()=>{
      const id=$('#logo-municipio-select').value; const m=estado.municipios.find(m=>m.id===id);
      $('#area-logo-municipio').innerHTML = '<h4 style="margin:10px 0 4px; font-weight:600; font-size:13px;">Logomarca</h4>' + blocoLogo('mun', m&&m.logo_url);
      ligarBlocoLogo('mun', async (arquivo)=>uploadLogo('municipio', id, arquivo), (url)=>{ if(m) m.logo_url=url; });
      $('#area-cor-municipio').innerHTML = '<h4 style="margin:14px 0 4px; font-weight:600; font-size:13px;">Cor de destaque</h4>' + blocoCor('mun', m&&m.cor_acento);
      ligarBlocoCor('mun', async (cor)=>atualizarCorMunicipio(id, cor), (cor)=>{ if(m) m.cor_acento=cor; });
    };
    $('#logo-municipio-select').addEventListener('change', trocarBlocoMunicipioSelecionado);
    trocarBlocoMunicipioSelecionado();
    inicializarCadastroMunicipioIBGE(async (nome, uf)=>{
      const resp = await criarMunicipio(nome, uf);
      if(!resp.ok){ alert(resp.erro); return; }
      estado.municipios.push(resp.registro);
      desenharMunicipios(); preencherSelectMunicipiosUnidade();
      const selLogo=$('#logo-municipio-select'); if(selLogo) selLogo.innerHTML = estado.municipios.map(m=>`<option value="${m.id}">${escaparHtml(m.nome)}</option>`).join('');
      trocarBlocoMunicipioSelecionado();
    });
  } else if(ehGerente){
    ligarBlocoLogo('mun', async (arquivo)=>uploadLogo('municipio', estado.perfil.municipio_id, arquivo), (url)=>{ if(meuMunicipio) meuMunicipio.logo_url=url; });
    ligarBlocoCor('mun', async (cor)=>atualizarCorMunicipio(estado.perfil.municipio_id, cor), (cor)=>{ if(meuMunicipio) meuMunicipio.cor_acento=cor; });
  } else if(ehCoordenador){
    ligarBlocoLogo('uni', async (arquivo)=>uploadLogo('unidade', estado.perfil.unidade_id, arquivo), (url)=>{ if(minhaUnidadeObj) minhaUnidadeObj.logo_url=url; });
  }

  // --- Unidades de saúde + Usuários (Admin/Gerente) ---
  if(podeGerirAcesso){
    $('#botao-add-unidade').addEventListener('click', async ()=>{
      const municipioId = ehAdmin ? $('#nova-unidade-municipio').value : estado.perfil.municipio_id;
      const nome=$('#nova-unidade-nome').value.trim(), tipo=$('#nova-unidade-tipo').value;
      if(!municipioId) return alert('Cadastre um município primeiro.');
      if(!nome) return alert('Preencha o nome da unidade.');
      const resp = await criarUnidade(municipioId, nome, tipo);
      if(!resp.ok){ alert(resp.erro); return; }
      estado.unidades.push(resp.registro); $('#nova-unidade-nome').value='';
      desenharUnidades();
      const selLogo=$('#logo-unidade-select'); if(selLogo) selLogo.innerHTML = estado.unidades.map(u=>`<option value="${u.id}">${escaparHtml(u.nome)}</option>`).join('');
    });
    $('#botao-novo-usuario').addEventListener('click', abrirModalNovoUsuario);
    if(ehAdmin) preencherSelectMunicipiosUnidade();
    desenharUnidades();
    const trocarBlocoUnidade = ()=>{
      const id=$('#logo-unidade-select').value; const u=estado.unidades.find(u=>u.id===id);
      $('#area-logo-unidade').innerHTML = blocoLogo('uni', u&&u.logo_url);
      ligarBlocoLogo('uni', async (arquivo)=>uploadLogo('unidade', id, arquivo), (url)=>{ if(u) u.logo_url=url; });
    };
    $('#logo-unidade-select').addEventListener('change', trocarBlocoUnidade);
    trocarBlocoUnidade();
    await carregarEDesenharUsuarios();
  }
}

/** Preenche Estado→Município do cadastro de município com dados oficiais do IBGE (evita erro de digitação).
    `aoAdicionar(nome, uf)` é chamado quando o usuário confirma o cadastro, em qualquer um dos dois caminhos. */
async function inicializarCadastroMunicipioIBGE(aoAdicionar){
  const selUf = $('#novo-municipio-uf'), selNome = $('#novo-municipio-nome');
  if(!selUf) return;
  const estados = await carregarEstadosIBGE();
  if(!estados){
    // Sem internet/IBGE fora do ar: cai para digitação manual, sem travar o cadastro.
    $('#area-cadastro-municipio').innerHTML = `
      <div class="campo" style="margin:0; min-width:160px;"><label>Nome do município</label><input type="text" id="novo-municipio-nome-manual" placeholder="Nome do município"></div>
      <div class="campo" style="margin:0; min-width:70px;"><label>UF</label><input type="text" id="novo-municipio-uf-manual" maxlength="2" style="text-transform:uppercase;"></div>
      <button class="botao botao-fantasma" id="botao-add-municipio">+ Adicionar município</button>
      <p style="color:var(--cor-saida); font-size:12.5px; width:100%; margin:4px 0 0;">Não consegui carregar a lista oficial do IBGE agora — digite manualmente.</p>`;
    $('#botao-add-municipio').addEventListener('click', async ()=>{
      const nome=$('#novo-municipio-nome-manual').value.trim(), uf=$('#novo-municipio-uf-manual').value.trim().toUpperCase();
      if(!nome||!uf) return alert('Preencha nome e UF.');
      const botao=$('#botao-add-municipio'); botao.disabled=true;
      await aoAdicionar(nome, uf);
      botao.disabled=false;
    });
    return;
  }
  selUf.innerHTML = '<option value="">Escolha o estado</option>' + estados.map(e=>`<option value="${e.sigla}">${escaparHtml(e.nome)} (${e.sigla})</option>`).join('');
  selUf.addEventListener('change', async ()=>{
    const uf = selUf.value;
    if(!uf){ selNome.disabled=true; selNome.innerHTML='<option value="">Escolha o estado primeiro</option>'; return; }
    selNome.disabled=true; selNome.innerHTML='<option value="">Carregando municípios…</option>';
    const municipios = await carregarMunicipiosIBGE(uf);
    if(!municipios){ selNome.innerHTML='<option value="">Não consegui carregar — tente de novo</option>'; return; }
    selNome.disabled=false;
    selNome.innerHTML = '<option value="">Escolha o município</option>' + municipios.map(nome=>`<option value="${escaparHtml(nome)}">${escaparHtml(nome)}</option>`).join('');
  });
  $('#botao-add-municipio').addEventListener('click', async ()=>{
    const uf = selUf.value, nome = selNome.value;
    if(!uf || !nome) return alert('Escolha o estado e o município.');
    const botao=$('#botao-add-municipio'); botao.disabled=true;
    await aoAdicionar(nome, uf);
    botao.disabled=false;
  });
}

function nomeMunicipioLogo(id){ const m=estado.municipios.find(m=>m.id===id); return m&&m.logo_url; }
function nomeUnidadeLogo(id){ const u=estado.unidades.find(u=>u.id===id); return u&&u.logo_url; }

function blocoLogo(prefixo, urlAtual){
  return `
    <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <div style="width:64px; height:64px; border-radius:8px; border:1px solid var(--cor-borda); background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <img id="preview-${prefixo}" src="${urlAtual||''}" style="max-width:100%; max-height:100%; ${urlAtual?'':'display:none;'}" alt="Logo">
        <span id="sem-logo-${prefixo}" style="font-size:11px; color:var(--cor-tinta-suave); ${urlAtual?'display:none;':''}">sem logo</span>
      </div>
      <div>
        <input type="file" id="arquivo-${prefixo}" accept="image/png,image/jpeg,image/svg+xml,image/webp">
        <div><button class="botao botao-fantasma" id="botao-${prefixo}" style="margin-top:6px;">Enviar logo</button></div>
        <div class="erro-form" id="erro-${prefixo}"></div>
      </div>
    </div>`;
}
function ligarBlocoLogo(prefixo, funcaoUpload, aoSalvar){
  const botao = document.getElementById('botao-'+prefixo);
  if(!botao) return;
  botao.addEventListener('click', async ()=>{
    const input = document.getElementById('arquivo-'+prefixo);
    const erroEl = document.getElementById('erro-'+prefixo);
    erroEl.textContent='';
    if(!input.files || !input.files[0]){ erroEl.textContent='Escolha um arquivo de imagem primeiro.'; return; }
    botao.disabled=true; botao.textContent='Enviando…';
    const resp = await funcaoUpload(input.files[0]);
    botao.disabled=false; botao.textContent='Enviar logo';
    if(!resp.ok){ erroEl.textContent=resp.erro; return; }
    const img = document.getElementById('preview-'+prefixo), semLogo = document.getElementById('sem-logo-'+prefixo);
    if(img){ img.src = resp.url; img.style.display=''; }
    if(semLogo) semLogo.style.display='none';
    if(aoSalvar) aoSalvar(resp.url);
  });
}

function blocoCor(prefixo, corAtual){
  return `
    <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
      <input type="color" id="cor-${prefixo}" value="${corAtual || '#E2992F'}" style="width:44px; height:34px; border:1px solid var(--cor-borda); border-radius:6px; padding:2px; background:#fff;">
      <button class="botao botao-fantasma" id="botao-cor-${prefixo}">Salvar cor</button>
      <span class="erro-form" id="erro-cor-${prefixo}"></span>
    </div>`;
}
function ligarBlocoCor(prefixo, funcaoSalvar, aoSalvar){
  const botao = document.getElementById('botao-cor-'+prefixo);
  if(!botao) return;
  botao.addEventListener('click', async ()=>{
    const input = document.getElementById('cor-'+prefixo);
    const erroEl = document.getElementById('erro-cor-'+prefixo);
    erroEl.textContent='';
    botao.disabled=true; botao.textContent='Salvando…';
    const resp = await funcaoSalvar(input.value);
    botao.disabled=false; botao.textContent='Salvar cor';
    if(!resp.ok){ erroEl.textContent=resp.erro; return; }
    if(aoSalvar) aoSalvar(input.value);
    aplicarCorDeMarca();
  });
}

function desenharMunicipios(){
  const alvo=$('#tabela-municipios'); if(!alvo) return;
  if(estado.municipios.length===0){ alvo.innerHTML='<div class="vazio">Nenhum município cadastrado ainda.</div>'; return; }
  alvo.innerHTML = `<table><thead><tr><th>Município</th><th>UF</th></tr></thead><tbody>
    ${estado.municipios.map(m=>`<tr><td>${escaparHtml(m.nome)}</td><td>${escaparHtml(m.uf)}</td></tr>`).join('')}
  </tbody></table>`;
}
function preencherSelectMunicipiosUnidade(){
  const sel=$('#nova-unidade-municipio'); if(!sel) return;
  sel.innerHTML = estado.municipios.map(m=>`<option value="${m.id}">${escaparHtml(m.nome)} (${escaparHtml(m.uf)})</option>`).join('');
}
function desenharUnidades(){
  const alvo=$('#tabela-unidades'); if(!alvo) return;
  if(estado.unidades.length===0){ alvo.innerHTML='<div class="vazio">Nenhuma unidade cadastrada ainda.</div>'; return; }
  alvo.innerHTML = `<table><thead><tr><th>Unidade</th><th>Tipo</th>${estado.perfil.papel==='Admin'?'<th>Município</th>':''}</tr></thead><tbody>
    ${estado.unidades.map(u=>`<tr><td>${escaparHtml(u.nome)}</td><td>${escaparHtml(u.tipo)}</td>${estado.perfil.papel==='Admin'?`<td>${escaparHtml(nomeMunicipio(u.municipio_id))}</td>`:''}</tr>`).join('')}
  </tbody></table>`;
}

async function carregarEDesenharUsuarios(){
  const alvo=$('#tabela-usuarios'); if(!alvo) return;
  alvo.innerHTML='Carregando…';
  const resp = await listarPerfis();
  if(!resp.ok){ alvo.innerHTML = `<div class="vazio">${escaparHtml(resp.erro)}</div>`; return; }
  estado._usuarios = resp.registros;
  if(resp.registros.length===0){ alvo.innerHTML='<div class="vazio">Nenhum usuário encontrado.</div>'; return; }
  const souGerente = estado.perfil.papel==='Gerente';
  alvo.innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Município</th><th>Unidade</th><th></th></tr></thead><tbody>
    ${resp.registros.map(u=>{
      const possoRedefinir = estado.perfil.papel==='Admin' || (souGerente && (u.papel==='Coordenador'||u.papel==='Colaborador'));
      return `<tr>
      <td>${escaparHtml(u.nome)}</td><td class="mono">${escaparHtml(u.usuario||'')}</td><td>${escaparHtml(u.papel)}</td>
      <td>${u.municipio_id?escaparHtml(nomeMunicipio(u.municipio_id)):'—'}</td>
      <td>${u.unidade_id?escaparHtml(nomeUnidade(u.unidade_id)):'—'}</td>
      <td>${possoRedefinir?`<button data-redefinir="${escaparHtml(u.id)}" data-nome="${escaparHtml(u.nome)}" style="background:none; border:1px solid var(--cor-borda); border-radius:6px; padding:4px 8px; font-size:12.5px;">Redefinir senha</button>`:''}</td>
    </tr>`;}).join('')}
  </tbody></table>`;
  $all('button[data-redefinir]', alvo).forEach(b=>b.addEventListener('click', ()=>abrirModalRedefinirSenha(b.dataset.redefinir, b.dataset.nome)));
}

function abrirModalRedefinirSenha(usuarioId, nome){
  $('#titulo-modal').textContent = 'Redefinir senha — ' + nome;
  $('#erro-modal').textContent = '';
  $('#form-modal').innerHTML = `
    <div class="campo"><label>Nova senha</label><input id="rs-senha" type="text" placeholder="mínimo 6 caracteres"></div>
    <div class="campo"><label>Confirmar</label><input id="rs-senha-conf" type="text"></div>`;
  estado._novoUsuarioModal = false; estado._editandoId = null; estado._redefinirSenhaId = usuarioId;
  $('#sobreposicao-modal').style.display='flex';
}

function abrirModalNovoUsuario(){
  const ehAdmin = estado.perfil.papel==='Admin';
  const papeisPermitidos = ehAdmin ? ['Admin','Gerente','Coordenador','Colaborador'] : ['Coordenador','Colaborador'];
  const municipiosDisponiveis = ehAdmin ? estado.municipios : estado.municipios.filter(m=>m.id===estado.perfil.municipio_id);

  $('#titulo-modal').textContent = 'Novo usuário';
  $('#erro-modal').textContent = '';
  $('#form-modal').innerHTML = `
    <div class="campo"><label>Nome</label><input id="nu-nome" type="text"></div>
    <div class="campo"><label>E-mail (login)</label><input id="nu-email" type="email"></div>
    <div class="campo"><label>Senha provisória</label><input id="nu-senha" type="text" placeholder="mínimo 6 caracteres"></div>
    <div class="campo"><label>Papel</label>
      <select id="nu-papel">${papeisPermitidos.map(p=>`<option value="${p}">${p}</option>`).join('')}</select>
    </div>
    <div class="campo" id="campo-nu-municipio"><label>Município</label>
      <select id="nu-municipio">${municipiosDisponiveis.map(m=>`<option value="${m.id}">${escaparHtml(m.nome)}</option>`).join('')}</select>
    </div>
    <div class="campo" id="campo-nu-unidade"><label>Unidade de saúde</label><select id="nu-unidade"></select></div>`;

  function atualizarCamposConforme(){
    const papel = $('#nu-papel').value;
    $('#campo-nu-municipio').style.display = papel==='Admin' ? 'none' : '';
    $('#campo-nu-unidade').style.display = (papel==='Coordenador'||papel==='Colaborador') ? '' : 'none';
    const municipioSelecionado = $('#nu-municipio') && $('#nu-municipio').value;
    const unidadesDoMunicipio = estado.unidades.filter(u=>u.municipio_id===municipioSelecionado);
    if($('#nu-unidade')) $('#nu-unidade').innerHTML = unidadesDoMunicipio.map(u=>`<option value="${u.id}">${escaparHtml(u.nome)}</option>`).join('') || '<option value="">Cadastre uma unidade primeiro</option>';
  }
  $('#nu-papel').addEventListener('change', atualizarCamposConforme);
  if($('#nu-municipio')) $('#nu-municipio').addEventListener('change', atualizarCamposConforme);
  atualizarCamposConforme();

  estado._novoUsuarioModal = true; estado._redefinirSenhaId = null;
  $('#sobreposicao-modal').style.display='flex';
}
