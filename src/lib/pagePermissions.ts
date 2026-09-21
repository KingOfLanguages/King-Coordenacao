import type { Profile } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Controle de visualização de página por role.
//
// Registry em código = fonte única de verdade das páginas e do acesso PADRÃO
// (que espelha o que estava fixo no App.tsx/AppLayout). O banco (page_permissions)
// guarda apenas OVERRIDES por página. Acesso efetivo = override, se existir; senão
// o padrão daqui. Admin sempre tem acesso total (não é configurável — evita lockout).
//
// Importante: isto controla a VISIBILIDADE no menu e o acesso às ROTAS (camada de
// UI). A proteção real dos dados continua nas policies de RLS do Supabase.
// ─────────────────────────────────────────────────────────────────────────────

/** Sujeitos configuráveis. Admin fica de fora de propósito: tem acesso a tudo. */
export type PermSubject = 'coordenacao' | 'lider' | 'suporte' | 'suporte_aluno' | 'comercial'

export const PERM_SUBJECTS: { key: PermSubject; label: string }[] = [
  { key: 'coordenacao',   label: 'Coordenação' },
  { key: 'lider',         label: 'Líder' },
  { key: 'suporte',       label: 'Suporte' },
  { key: 'suporte_aluno', label: 'Suporte · Aluno' },
  { key: 'comercial',     label: 'Comercial' },
]

const SUBJECT_SET = new Set<string>(PERM_SUBJECTS.map(s => s.key))

export interface PageDef {
  /** Identificador estável — igual ao page_key no banco. */
  key: string
  /** Rota principal (usada como destino no menu). */
  path: string
  /** Rótulo exibido no menu e na tela de configurações. */
  label: string
  /** Seção usada para AGRUPAR ESTA TELA DE CONFIGURAÇÕES. '' = link solto.
   *  NÃO monta o menu de navegação: quem faz isso é a constante NAV em
   *  AppLayout.tsx, que lista as page keys de cada dropdown à mão. Página nova
   *  precisa entrar NOS DOIS lugares — só aqui, ela fica acessível pela URL e
   *  configurável, mas invisível no menu. */
  section: string
  /** Aparece no menu de navegação? */
  nav: boolean
  /** Match exato de rota no menu (ex.: /dashboard não fica ativo em /dashboard/geral). */
  exact?: boolean
  /** Acesso padrão, quando não há override no banco. Admin sempre incluído implicitamente. */
  defaultRoles: PermSubject[]
  /** Chaves de telas que viraram ABAS desta (consolidação de 2026-09). A tela
   *  abre — no menu e na rota — se a pessoa puder ver ela OU qualquer aba; cada
   *  aba continua liberada pela própria chave, então os overrides já salvos no
   *  banco seguem valendo aba por aba. */
  abas?: string[]
}

// Ordem aqui = ordem de exibição na tela de Configurações.
export const PAGES: PageDef[] = [
  // Tela de entrada (2026-09): o que pede ação no dia. Cada card dela respeita a
  // permissão da tela de origem, então liberar "Hoje" não abre nada a mais.
  { key: 'hoje',            path: '/hoje',           label: 'Hoje',                 section: '',            nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },

  // ── Reuniões ──
  // Uma tela, três abas (2026-09). 'reunioes-dia' é a aba Agenda e o item do
  // menu; 'suporte-reunioes' libera a busca e 'agendas' a configuração.
  { key: 'reunioes-dia',    path: '/reunioes',       label: 'Reuniões',             section: 'Reuniões',    nav: true,  defaultRoles: ['coordenacao'], abas: ['suporte-reunioes', 'agendas'] },
  { key: 'agendas',         path: '/reunioes?aba=agendas', label: 'Reuniões › Configurar agendas', section: 'Reuniões', nav: false, defaultRoles: ['coordenacao'] },
  // Era a página /emails; desde 2026-09 é a ação "Enviar e-mail" do Índice de
  // atenção. A chave segue liberando quem pode disparar.
  { key: 'emails',          path: '/acompanhamento', label: 'Acompanhamento › Enviar e-mail', section: 'Acompanhamento', nav: false, defaultRoles: ['coordenacao', 'lider'] },

  // ── Dashboard ──
  // Uma tela, três abas (2026-09). 'dashboard' é a aba Coordenação e o item do
  // menu; as outras duas chaves liberam as próprias abas.
  { key: 'dashboard',       path: '/dashboard',      label: 'Dashboard',            section: 'Dashboard',   nav: true,  defaultRoles: ['coordenacao', 'lider'], abas: ['dashboard-geral', 'retencao'] },
  { key: 'dashboard-geral', path: '/dashboard?aba=geral', label: 'Dashboard › Geral', section: 'Dashboard', nav: false, defaultRoles: ['coordenacao', 'lider'] },
  { key: 'retencao',        path: '/dashboard?aba=retencao', label: 'Dashboard › Turnover & Retenção', section: 'Dashboard', nav: false, defaultRoles: ['coordenacao', 'lider'] },

  // ── Professores ──
  { key: 'professores',     path: '/professores',    label: 'Professores',          section: 'Professores', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'onboarding',      path: '/onboarding',     label: 'Onboarding',           section: 'Professores', nav: true,  defaultRoles: ['coordenacao', 'suporte'] },
  { key: 'suporte-reunioes', path: '/reunioes?aba=buscar', label: 'Reuniões › Buscar por professor', section: 'Reuniões', nav: false, defaultRoles: ['suporte'] },
  // Tela do setor Comercial ("esse teacher é confiável?"). É a ÚNICA página do
  // cargo comercial — mexer aqui tira o chão dele; coordenação/líder ganham junto
  // porque a mesma leitura serve pra decidir alocação.
  { key: 'confiabilidade',  path: '/confiabilidade', label: 'Confiabilidade do Professor', section: 'Professores', nav: true, defaultRoles: ['comercial', 'coordenacao', 'lider'] },

  // ── Acompanhamento ──
  // Uma tela, três abas (2026-09). 'acompanhamento' é a aba Índice de atenção e
  // o item do menu; as outras chaves liberam as próprias abas.
  { key: 'acompanhamento',  path: '/acompanhamento', label: 'Acompanhamento',       section: 'Acompanhamento', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'], abas: ['pendencias', 'mes-analise', 'emails'] },
  { key: 'pendencias',      path: '/acompanhamento?aba=pendencias', label: 'Acompanhamento › Pendências do King', section: 'Acompanhamento', nav: false, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'mes-analise',     path: '/acompanhamento?aba=mes-analise', label: 'Acompanhamento › Mês de Análise', section: 'Acompanhamento', nav: false, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  // A chave continua 'retorno-pausa' de propósito: é ela que indexa os overrides
  // de permissão já salvos no banco — renomear apagaria as configurações atuais.
  // Uma tela, duas abas (2026-09): "Solicitações" dos professores. A chave
  // 'retorno-pausa' é a aba Pausas e o item do menu; 'transferencias' libera a
  // própria aba.
  { key: 'retorno-pausa',   path: '/solicitacoes',   label: 'Solicitações',         section: 'Solicitações', nav: true, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'], abas: ['transferencias'] },
  { key: 'transferencias',  path: '/solicitacoes?aba=transferencias', label: 'Solicitações › Transferências', section: 'Solicitações', nav: false, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },

  // ── Incidentes ──
  { key: 'incidentes',      path: '/incidentes',     label: 'Incidentes',           section: 'Incidentes', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  // Era a página /alunos; desde 2026-09 é a visão "Por aluno" dentro de
  // Incidentes. A chave fica: é ela que guarda os overrides e libera a visão.
  { key: 'alunos',          path: '/incidentes?visao=alunos', label: 'Incidentes › Por aluno', section: 'Incidentes', nav: false, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },

  // ── Minha Área ──
  // Uma tela, duas abas (2026-09): "Para fazer" e "Projetos". Juntou Tarefas,
  // Projetos e a Minha Área antiga. 'minha-area' libera a tela e as anotações;
  // as outras duas chaves seguem liberando cada parte, então os overrides já
  // salvos no banco continuam valendo.
  { key: 'minha-area',      path: '/minha-area',     label: 'Minha Área',           section: 'Minha Área',  nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'], abas: ['convocacoes', 'projetos'] },
  // Era a tela Tarefas (/convocacoes): hoje libera as tarefas e as Mensagens do dia da lista Para fazer.
  { key: 'convocacoes',     path: '/minha-area',     label: 'Minha Área › Tarefas e mensagens do dia', section: 'Minha Área', nav: false, defaultRoles: ['coordenacao', 'suporte'] },
  // Controle de projetos da King. Coordenação e Suporte (ao professor) sugerem;
  // 'lider' entra explícito porque é quem aprova — e um líder de outro setor
  // (ex.: Suporte ao Aluno) precisa enxergar a fila de aprovação.
  { key: 'projetos',        path: '/minha-area?aba=projetos', label: 'Minha Área › Projetos', section: 'Minha Área', nav: false, defaultRoles: ['coordenacao', 'suporte', 'lider'] },
]

export const PAGE_BY_KEY: Record<string, PageDef> = Object.fromEntries(PAGES.map(p => [p.key, p]))

/** Overrides carregados do banco: page_key → roles permitidos. */
export type PermOverrides = Record<string, PermSubject[]>

/** Normaliza um text[] cru do banco para apenas sujeitos conhecidos. */
export function normalizeRoles(raw: unknown): PermSubject[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is PermSubject => typeof r === 'string' && SUBJECT_SET.has(r))
}

/** Acesso efetivo de uma página: override do banco, se houver; senão o padrão do registry. */
export function effectiveRoles(key: string, overrides: PermOverrides): PermSubject[] {
  return overrides[key] ?? PAGE_BY_KEY[key]?.defaultRoles ?? []
}

/** Sujeitos aos quais um perfil pertence (+ se é admin, que ignora tudo). */
export function subjectsOf(profile: Profile | null): { admin: boolean; subjects: Set<PermSubject> } {
  const subjects = new Set<PermSubject>()
  if (!profile) return { admin: false, subjects }
  const admin = profile.is_admin === true || profile.role === 'admin'
  if (profile.role === 'coordenacao')   subjects.add('coordenacao')
  if (profile.role === 'suporte')       subjects.add('suporte')
  if (profile.role === 'suporte_aluno') subjects.add('suporte_aluno')
  if (profile.role === 'comercial')     subjects.add('comercial')
  if (profile.is_lider === true)        subjects.add('lider')
  return { admin, subjects }
}

/** O perfil pode ver a página `key`? Admin sempre pode. */
export function canViewPage(profile: Profile | null, key: string, overrides: PermOverrides): boolean {
  const { admin, subjects } = subjectsOf(profile)
  if (admin) return true
  const roles = effectiveRoles(key, overrides)
  return roles.some(r => subjects.has(r))
}

/** Pode abrir a TELA: vê a página em si ou alguma das abas que ela reúne. */
export function canOpenPage(profile: Profile | null, key: string, overrides: PermOverrides): boolean {
  if (canViewPage(profile, key, overrides)) return true
  return (PAGE_BY_KEY[key]?.abas ?? []).some(k => canViewPage(profile, k, overrides))
}
