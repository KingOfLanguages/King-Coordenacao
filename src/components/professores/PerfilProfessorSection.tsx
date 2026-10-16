import { Baby, GraduationCap, Globe2, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePerfilProfessor, type PerfilProfessor } from '@/hooks/usePerfilProfessor'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Perfil" da ficha: o que o professor respondeu no onboarding do King
// (tabela professor_perfil). Só leitura — quem muda é o professor, no King, e
// chega aqui pelo próximo import.
// ─────────────────────────────────────────────────────────────────────────────

const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null)

export function PerfilProfessorSection({ professorId }: { professorId: string }) {
  const { data: perfil, isLoading, error } = usePerfilProfessor(professorId)

  if (isLoading) return <div className="card-surface p-8 animate-pulse h-40" />
  if (error) return <div className="card-surface p-8 text-center text-[13px] text-ink-muted">Não foi possível carregar o perfil.</div>
  if (!perfil) {
    return (
      <div className="card-surface p-8 text-center text-[13px] text-ink-muted">
        Este professor não tem perfil de onboarding importado do King.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Preferencias perfil={perfil} />
        <ComoDaAula perfil={perfil} />
        <Formacao perfil={perfil} />
        <VideoApresentacao perfil={perfil} />
      </div>
      <p className="text-[11.5px] text-ink-muted">
        Do onboarding do King ({perfil.fonte}), importado em {dataBr(perfil.importado_em)}.
        {perfil.onboarding_atualizado_em && <> O professor editou o perfil pela última vez em {dataBr(perfil.onboarding_atualizado_em)}.</>}
      </p>
    </div>
  )
}

function Preferencias({ perfil }: { perfil: PerfilProfessor }) {
  const linhas: [string, string[] | null][] = [
    ['Público',             perfil.publico],
    ['Níveis',              perfil.niveis],
    ['Idiomas',             perfil.idiomas],
    ['Objetivos dos alunos', perfil.objetivos],
    ['Áreas dos alunos',    perfil.areas],
    ['Alunos que destrava', perfil.alunos_que_destrava],
  ]
  const respondeu = linhas.some(([, v]) => v?.length)

  return (
    <section className="card-surface p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-micro">Preferências</h2>
        <Criancas valor={perfil.atende_criancas} />
      </div>
      {perfil.nome_preferido && (
        <p className="text-[12.5px] text-ink-secondary">Nome preferido: <span className="font-medium text-ink">{perfil.nome_preferido}</span></p>
      )}
      {!respondeu ? (
        <p className="text-[13px] text-ink-muted">Não respondeu as preferências no King.</p>
      ) : (
        <dl className="space-y-3">
          {linhas.filter(([, v]) => v?.length).map(([rotulo, v]) => (
            <div key={rotulo} className="space-y-1">
              <dt className="text-[11.5px] text-ink-muted">{rotulo}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {v!.map(x => (
                  <span
                    key={x}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[12px]',
                      x === 'Crianças' ? 'bg-aviso-infoBg text-aviso-infoFg font-medium' : 'bg-surface-subtle text-ink-secondary',
                    )}
                  >{x}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function Criancas({ valor }: { valor: boolean | null }) {
  const [texto, classe] =
    valor === true  ? ['Dá aula para criança', 'bg-aviso-infoBg text-aviso-infoFg'] :
    valor === false ? ['Não marcou criança', 'bg-surface-subtle text-ink-secondary'] :
                      ['Criança: sem resposta', 'bg-surface-subtle text-ink-muted']
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', classe)}>
      <Baby className="h-3 w-3" />{texto}
    </span>
  )
}

function ComoDaAula({ perfil }: { perfil: PerfilProfessor }) {
  const itens: [string, string | null][] = [
    ['Quando o aluno trava',    perfil.quando_aluno_trava],
    ['Português em aula',       perfil.portugues_em_aula],
    ['Variante do inglês',      perfil.variante_ingles],
    ['Alunos neurodivergentes', perfil.alunos_neurodivergentes],
  ]
  const temEscala = perfil.estilo_estrutura || perfil.estilo_correcao || perfil.estilo_ritmo
  const respondeu = temEscala || itens.some(([, v]) => v)

  return (
    <section className="card-surface p-5 space-y-4">
      <h2 className="label-micro">Como dá aula</h2>
      {!respondeu ? (
        <p className="text-[13px] text-ink-muted">Não respondeu no King.</p>
      ) : (
        <>
          {temEscala && (
            <div className="space-y-2.5">
              <Escala titulo="Estrutura" valor={perfil.estilo_estrutura} esquerda="Deixo a conversa levar" direita="Sigo o plano à risca" />
              <Escala titulo="Correção"  valor={perfil.estilo_correcao}  esquerda="Corrijo na hora, sempre" direita="Corrijo no fim" />
              <Escala titulo="Ritmo"     valor={perfil.estilo_ritmo}     esquerda="Puxo o ritmo e cobro" direita="Sigo o tempo do aluno" />
            </div>
          )}
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {itens.filter(([, v]) => v).map(([rotulo, v]) => (
              <div key={rotulo}>
                <dt className="text-[11.5px] text-ink-muted">{rotulo}</dt>
                <dd className="text-[13px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}

function Escala({ titulo, valor, esquerda, direita }: { titulo: string; valor: number | null; esquerda: string; direita: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11.5px] text-ink-muted">{titulo}{valor ? '' : ' · sem resposta'}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11.5px]">
        <span className={cn('text-right', valor && valor <= 2 ? 'text-ink' : 'text-ink-muted')}>{esquerda}</span>
        <span className="flex gap-1" role="img" aria-label={valor ? `${titulo}: ${valor} de 5` : `${titulo}: sem resposta`}>
          {[1, 2, 3, 4, 5].map(i => (
            <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i === valor ? 'bg-accentBlue' : 'bg-surface-muted')} />
          ))}
        </span>
        <span className={cn(valor && valor >= 4 ? 'text-ink' : 'text-ink-muted')}>{direita}</span>
      </div>
    </div>
  )
}

function Formacao({ perfil }: { perfil: PerfilProfessor }) {
  const anoAtual = new Date().getFullYear()
  const anos = perfil.leciona_desde ? anoAtual - perfil.leciona_desde : null
  const curso = [perfil.curso, perfil.curso_turno, perfil.curso_conclusao_ano && `conclusão ${perfil.curso_conclusao_ano}`]
    .filter(Boolean).join(' · ')

  return (
    <section className="card-surface p-5 space-y-3">
      <h2 className="label-micro">Formação e experiência</h2>
      <dl className="space-y-2.5">
        <Item icone={<GraduationCap className="h-3.5 w-3.5" />} rotulo="Faculdade" valor={perfil.formacao} detalhe={curso || null} />
        <Item
          rotulo="Dá aula desde"
          valor={perfil.leciona_desde ? String(perfil.leciona_desde) : null}
          detalhe={anos === null ? null : anos === 0 ? 'começou este ano' : `${anos} ano${anos !== 1 ? 's' : ''}`}
        />
        <Item
          rotulo="Certificado de proficiência"
          valor={perfil.tem_certificado === null ? null : perfil.tem_certificado ? 'Sim' : 'Não'}
          detalhe={perfil.tem_certificado ? perfil.certificado : null}
        />
        <Item
          icone={<Globe2 className="h-3.5 w-3.5" />}
          rotulo="Experiência no exterior"
          valor={perfil.experiencia_exterior === null ? null : perfil.experiencia_exterior ? 'Sim' : 'Não'}
          detalhe={perfil.experiencia_exterior ? perfil.exterior_local : null}
        />
      </dl>
    </section>
  )
}

function VideoApresentacao({ perfil }: { perfil: PerfilProfessor }) {
  const status = perfil.video_status ?? 'Sem vídeo'
  const classe =
    status === 'Aprovado'   ? 'bg-urg-lowBg text-urg-lowFg' :
    status === 'Reprovado'  ? 'bg-urg-highBg text-urg-highFg' :
    status === 'Em análise' ? 'bg-aviso-warnBg text-aviso-warnFg' :
                              'bg-surface-subtle text-ink-muted'
  return (
    <section className="card-surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label-micro">Vídeo de apresentação</h2>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', classe)}>
          <Video className="h-3 w-3" />{status}
        </span>
      </div>
      {(perfil.video_enviado_em || perfil.video_revisado_em) && (
        <p className="text-[12.5px] text-ink-secondary tabular-nums">
          {perfil.video_enviado_em && <>Enviado em {dataBr(perfil.video_enviado_em)}</>}
          {perfil.video_enviado_em && perfil.video_revisado_em && ' · '}
          {perfil.video_revisado_em && <>revisado em {dataBr(perfil.video_revisado_em)}</>}
        </p>
      )}
      {perfil.video_motivo_reprovacao && (
        <p className="text-[12.5px] text-ink-secondary leading-relaxed border-l-2 border-line pl-3">{perfil.video_motivo_reprovacao}</p>
      )}
      {status === 'Sem vídeo' && <p className="text-[13px] text-ink-muted">O professor ainda não enviou o vídeo no King.</p>}
    </section>
  )
}

function Item({ icone, rotulo, valor, detalhe }: { icone?: React.ReactNode; rotulo: string; valor: string | null; detalhe?: string | null }) {
  return (
    <div>
      <dt className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted">{icone}{rotulo}</dt>
      <dd className="text-[13px] text-ink">
        {valor ?? <span className="text-ink-muted">sem resposta</span>}
        {detalhe && <span className="text-ink-secondary"> · {detalhe}</span>}
      </dd>
    </div>
  )
}
