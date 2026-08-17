/* ============================================================================
   CONFIGURAÇÃO
   ============================================================================ */
const CONFIG = { SUPABASE_URL: 'https://tvcvanvnjbfzmsspiyxb.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_HAiRkJ5AuWNosaTMiOiHbg_rIrk85-u' };
const MODO_DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
const sb = MODO_DEMO ? null : supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth:{ persistSession:false } });

const COLUNAS_MOVIMENTACAO = [
  { campo:'unidade_id', nome:'Unidade de Saúde', tipo:'unidade' },
  { campo:'data', nome:'Data', tipo:'data' },
  { campo:'turno', nome:'Turno', tipo:'select', lista:'Turno' },
  { campo:'colaborador', nome:'Colaborador', tipo:'texto' },
  { campo:'tipo', nome:'E/S', tipo:'select', lista:'E/S' },
  { campo:'material', nome:'Material', tipo:'select', lista:'Material' },
  { campo:'lote', nome:'Lote', tipo:'texto' },
  { campo:'validade', nome:'Validade', tipo:'data' },
  { campo:'destino', nome:'Destino (setor)', tipo:'select', lista:'Destino' },
  { campo:'nome_paciente', nome:'Nome do Paciente', tipo:'texto' },
  { campo:'nota_fiscal', nome:'Nota Fiscal', tipo:'texto' },
  { campo:'qtde', nome:'Qtde', tipo:'numero' }
];
const NIVEL = { Admin:4, Gerente:3, Coordenador:2, Colaborador:1 };

const estado = {
  token:null, perfil:null, listas:{}, unidades:[], municipios:[], organizacao:null,
  cacheMovimentacoes:[], dashboard:{ dados:null, timer:null, autoAtualizar:false }, abaTimer:null
};
const $ = (s,c)=>(c||document).querySelector(s);
const $all = (s,c)=>Array.from((c||document).querySelectorAll(s));
function escaparHtml(t){ return String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatarData(v){ if(!v) return ''; const d=new Date(v); return isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-BR'); }
function paraInputData(v){ if(!v) return ''; const d=new Date(v); return isNaN(d.getTime())?'':d.toISOString().slice(0,10); }
function nomeDoMes(k){ const [a,m]=k.split('-').map(Number); return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][m-1]+'/'+String(a).slice(2); }
const ehEntrada = v => String(v||'').toLowerCase().startsWith('entrada');
const ehSaida = v => String(v||'').toLowerCase().startsWith('sa');
function nomeUnidade(id){ const u = estado.unidades.find(u=>u.id===id); return u? u.nome : '—'; }
function nomeMunicipio(id){ const m = estado.municipios.find(m=>m.id===id); return m? m.nome : '—'; }

let reqAtivas=0;
function progOn(){ reqAtivas++; $('#barra-progresso').classList.add('ativa'); }
function progOff(){ reqAtivas=Math.max(0,reqAtivas-1); if(reqAtivas===0) $('#barra-progresso').classList.remove('ativa'); }

