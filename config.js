/* Ajustes do evento. Mude aqui e publique de novo.
   tipos e etapas precisam ser iguais aos do apps-script.gs.
   endpoint pode ficar vazio: a URL e o código são colados na tela Planilha de cada aparelho. */
window.RADAR_CONFIG = {
  meta: 10,
  endpoint: '',
  servicos: ['TOS', 'Trevi Focus', 'Trevi Advisory', 'Trevi Recruiter'],
  tipos: [
    { id: 'Quente', dica: 'quer avançar' },
    { id: 'Morno', dica: 'avaliando' },
    { id: 'Frio', dica: 'só conhecendo' }
  ],
  etapas: ['Novo', 'Contato feito', 'Reunião marcada', 'Proposta', 'Fechado', 'Perdido'],
  syncSegundos: 30
};
