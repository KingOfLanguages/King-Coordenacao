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
}

// Ordem aqui = ordem de exibição na tela de Configurações.
export const PAGES: PageDef[] = [
  // ── Reuniões ──
  { key: 'reunioes-dia',    path: '/reunioes-dia',   label: 'Reuniões do Dia',      section: 'Reuniões',    nav: true,  defaultRoles: ['coordenacao'] },
  { key: 'agendas',         path: '/admin/agendas',  label: 'Agendas',              section: 'Reuniões',    nav: true,  defaultRoles: ['coordenacao'] },
  { key: 'emails',          path: '/emails',         label: 'Disparo de E-mails',   section: 'Reuniões',    nav: true,  defaultRoles: ['coordenacao', 'lider'] },

  // ── Dashboard ──
  { key: 'dashboard',       path: '/dashboard',      label: 'Dashboard da Coordenação', section: 'Dashboard', nav: true, exact: true, defaultRoles: ['coordenacao', 'lider'] },
  { key: 'dashboard-geral', path: '/dashboard/geral', label: 'Dashboard Geral',     section: 'Dashboard',   nav: true,  defaultRoles: ['coordenacao', 'lider'] },
  { key: 'retencao',        path: '/retencao',       label: 'Turnover & Retenção',  section: 'Dashboard',   nav: true,  defaultRoles: ['coordenacao', 'lider'] },

  // ── Professores ──
  { key: 'professores',     path: '/professores',    label: 'Professores',          section: 'Professores', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'onboarding',      path: '/onboarding',     label: 'Onboarding',           section: 'Professores', nav: true,  defaultRoles: ['coordenacao', 'suporte'] },
  { key: 'suporte-reunioes', path: '/suporte/reunioes', label: 'Buscar Reuniões',   section: 'Professores', nav: true,  defaultRoles: ['suporte'] },
  // Tela do setor Comercial ("esse teacher é confiável?"). É a ÚNICA página do
  // cargo comercial — mexer aqui tira o chão dele; coordenação/líder ganham junto
  // porque a mesma leitura serve pra decidir alocação.
  { key: 'confiabilidade',  path: '/confiabilidade', label: 'Confiabilidade do Professor', section: 'Professores', nav: true, defaultRoles: ['comercial', 'coordenacao', 'lider'] },

  // ── Acompanhamento ──
  // 'acompanhamento' é o Índice de Prioridade; o rótulo evita colidir com o nome do grupo.
  { key: 'acompanhamento',  path: '/acompanhamento', label: 'Índice de Prioridade', section: 'Acompanhamento', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'pendencias',      path: '/pendencias',     label: 'Central de Pendências', section: 'Acompanhamento', nav: true, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'mes-analise',     path: '/mes-analise',    label: 'Mês de Análise',       section: 'Acompanhamento', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  // A chave continua 'retorno-pausa' de propósito: é ela que indexa os overrides
  // de permissão já salvos no banco — renomear apagaria as configurações atuais.
  { key: 'retorno-pausa',   path: '/pausas',         label: 'Acompanhamento de Pausas', section: 'Acompanhamento', nav: true, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'transferencias',  path: '/transferencias', label: 'Transferências de Aluno', section: 'Acompanhamento', nav: true, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },

  // ── Incidentes ──
  { key: 'incidentes',      path: '/incidentes',     label: 'Incidentes',           section: 'Incidentes', nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  { key: 'alunos',          path: '/alunos',         label: 'Reclamações por Aluno', section: 'Incidentes', nav: true, defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },

  // ── Links soltos ──
  { key: 'minha-area',      path: '/minha-area',     label: 'Minha Área',           section: '',            nav: true,  defaultRoles: ['coordenacao', 'suporte', 'suporte_aluno'] },
  // 'convocacoes' é a rota da página; o rótulo é "Tarefas" (o /tarefas antigo redireciona pra cá).
  { key: 'convocacoes',     path: '/convocacoes',    label: 'Tarefas',              section: '',            nav: true,  defaultRoles: ['coordenacao', 'suporte'] },
  // Controle de projetos da King. Coordenação e Suporte (ao professor) sugerem;
  // 'lider' entra explícito porque é quem aprova — e um líder de outro setor
  // (ex.: Suporte ao Aluno) precisa enxergar a fila de aprovação.
  { key: 'projetos',        path: '/projetos',       label: 'Projetos',             section: '',            nav: true,  defaultRoles: ['coordenacao', 'suporte', 'lider'] },
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
