/* ============================================================================
   MODO DEMONSTRAÇÃO — município/unidades/usuários fictícios em memória.
   ============================================================================ */
const demo = (function(){
  function h(diasAtras){ const d=new Date(); d.setDate(d.getDate()-diasAtras); return d.toISOString().slice(0,10); }
  const municipios = [ { id:'mun1', nome:'Sobral', uf:'CE', logo_url:null }, { id:'mun2', nome:'Fortaleza', uf:'CE', logo_url:null } ];
  const unidades = [
    { id:'un1', municipio_id:'mun1', nome:'Hospital Municipal de Sobral', tipo:'Hospital', logo_url:null },
    { id:'un2', municipio_id:'mun1', nome:'UBS Centro', tipo:'UBS', logo_url:null },
    { id:'un3', municipio_id:'mun2', nome:'UPA Fortaleza Leste', tipo:'UPA', logo_url:null }
  ];
  const organizacao = { nome:'Minha Organização (demo)', logo_url:null };
  const listas = { 'Turno':['Manhã','Tarde','Noite'], 'E/S':['Entrada','Saída'],
    'Material':['Dipirona 500mg','Amoxicilina 500mg','Soro Fisiológico 0,9% 500ml','Paracetamol 750mg'],
    'Destino':['Farmácia Central','Enfermaria A','Enfermaria B','Centro Cirúrgico','UTI'] };
  const perfis = {
    'admin@demo.com':      { senha:'admin123',   nome:'Ana (Admin)',              papel:'Admin',       municipio_id:null,  unidade_id:null },
    'gerente@demo.com':    { senha:'gerente123', nome:'Bruno (Gerente Sobral)',   papel:'Gerente',     municipio_id:'mun1', unidade_id:null },
    'coordenador@demo.com':{ senha:'coord123',   nome:'Carla (Coord. Hospital)',  papel:'Coordenador', municipio_id:'mun1', unidade_id:'un1' },
    'colaborador@demo.com':{ senha:'colab123',   nome:'Diego (Colaborador)',      papel:'Colaborador', municipio_id:'mun1', unidade_id:'un1' }
  };
  const movimentacoes = [
    { id:'m1', unidade_id:'un1', data:h(40), turno:'Manhã', colaborador:'Diego (Colaborador)', tipo:'Entrada', material:'Dipirona 500mg', lote:'DPN2301', validade:h(-320), destino:'Farmácia Central', nome_paciente:'', nota_fiscal:'NF-1001', qtde:500 },
    { id:'m2', unidade_id:'un1', data:h(30), turno:'Tarde', colaborador:'Diego (Colaborador)', tipo:'Saída', material:'Dipirona 500mg', lote:'DPN2301', validade:h(-320), destino:'Enfermaria A', nome_paciente:'Maria Silva', nota_fiscal:'', qtde:40 },
    { id:'m3', unidade_id:'un2', data:h(18), turno:'Manhã', colaborador:'Bruno (Gerente Sobral)', tipo:'Entrada', material:'Amoxicilina 500mg', lote:'AMX0987', validade:h(-200), destino:'Farmácia Central', nome_paciente:'', nota_fiscal:'NF-1002', qtde:300 },
    { id:'m4', unidade_id:'un3', data:h(5), turno:'Noite', colaborador:'Ana (Admin)', tipo:'Saída', material:'Amoxicilina 500mg', lote:'AMX0987', validade:h(-200), destino:'UTI', nome_paciente:'João Souza', nota_fiscal:'', qtde:60 }
  ];
  return { municipios, unidades, listas, perfis, movimentacoes, organizacao };
})();
function atraso(){ return new Promise(r=>setTimeout(r, 150+Math.random()*150)); }

function unidadesPermitidasDemo(perfil){
  if(perfil.papel==='Admin') return demo.unidades;
  if(perfil.papel==='Gerente') return demo.unidades.filter(u=>u.municipio_id===perfil.municipio_id);
  return demo.unidades.filter(u=>u.id===perfil.unidade_id);
}
function municipiosPermitidosDemo(perfil){
  if(perfil.papel==='Admin') return demo.municipios;
  return demo.municipios.filter(m=>m.id===perfil.municipio_id);
}

