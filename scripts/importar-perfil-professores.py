"""Gera o SQL que importa o perfil de onboarding do King em `professor_perfil`.

Uso (o SQL sai FORA do repositório — ele tem dados de professores):

    python -I scripts/importar-perfil-professores.py <export.csv> <saida.sql>
    npx supabase db query --linked -o json -f <saida.sql>

O CSV é o export "onboarding-professores-AAAA-MM-DD.csv" do King (";" e BOM).
Lê SÓ as colunas da lista abaixo: data de nascimento, gênero, endereço, CEP,
Instagram etc. nunca entram no SQL. Casa por professores.kms_id e faz upsert,
então rodar de novo com um export mais novo só atualiza.
"""
import csv
import datetime
import os
import sys

ANO_ATUAL = datetime.date.today().year

TEXTO = {
    'nome_preferido':          'Nome preferido',
    'formacao':                'Formação',
    'curso':                   'Curso',
    'curso_turno':             'Turno do curso',
    'certificado':             'Certificado',
    'exterior_local':          'Local da experiência no exterior',
    'quando_aluno_trava':      'Quando o aluno trava',
    'portugues_em_aula':       'Português em aula',
    'variante_ingles':         'Variante do inglês',
    'alunos_neurodivergentes': 'Alunos neurodivergentes',
    'video_status':            'Status do vídeo',
    'video_motivo_reprovacao': 'Motivo da reprovação do vídeo',
}
SIM_NAO = {
    'tem_certificado':      'Tem certificado de proficiência',
    'experiencia_exterior': 'Experiência no exterior',
}
ANO = {
    'curso_conclusao_ano': 'Ano de conclusão do curso',
    'leciona_desde':       'Ano em que começou a lecionar',
}
ESCALA = {
    'estilo_estrutura': 'Estrutura da aula',
    'estilo_correcao':  'Correção',
    'estilo_ritmo':     'Ritmo',
}
LISTA = {
    'idiomas':             'Idiomas',
    'publico':             'Público',
    'niveis':              'Níveis',
    'objetivos':           'Objetivos dos alunos',
    'areas':               'Áreas',
    'alunos_que_destrava': 'Alunos que destrava',
}
DATA = {
    'video_enviado_em':         'Vídeo enviado em',
    'video_revisado_em':        'Vídeo revisado em',
    'onboarding_atualizado_em': 'Onboarding atualizado em',
}


def coluna(cabecalho, nome):
    """As escalas vêm com a legenda no nome ("Correção (1 = …)"): casa pelo começo."""
    for c in cabecalho:
        if c == nome or c.startswith(nome + ' ('):
            return c
    raise SystemExit(f'Coluna não encontrada no CSV: {nome!r}')


def lit(s):
    return "'" + s.replace("'", "''") + "'"


def texto(v):
    v = ' '.join(v.replace('\r', '').split()) if v else ''
    return lit(v) if v else 'NULL'


def sim_nao(v):
    v = (v or '').strip().lower()
    return {'sim': 'true', 'não': 'false'}.get(v, 'NULL')


def ano(v, maximo):
    v = (v or '').strip()
    if not v.isdigit():
        return 'NULL'
    n = int(v)
    return str(n) if 1950 <= n <= maximo else 'NULL'


def escala(v):
    v = (v or '').strip()
    return v if v in ('1', '2', '3', '4', '5') else 'NULL'


def lista(v):
    itens = [' '.join(i.split()) for i in (v or '').split('|')]
    itens = [i for i in itens if i]
    if not itens:
        return 'NULL'
    return 'ARRAY[' + ', '.join(lit(i) for i in itens) + ']::text[]'


def data(v):
    # "15/10/2026 - 20:36:21", horário de Brasília (sem horário de verão desde 2019)
    v = (v or '').strip()
    if not v:
        return 'NULL'
    d, h = [x.strip() for x in v.split(' - ')]
    dd, mm, aa = d.split('/')
    return lit(f'{aa}-{mm}-{dd} {h}-03') + '::timestamptz'


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    origem, saida = sys.argv[1], sys.argv[2]
    fonte = os.path.basename(origem)

    with open(origem, encoding='utf-8-sig', newline='') as f:
        leitor = csv.DictReader(f, delimiter=';')
        cab = leitor.fieldnames or []
        mapa = {k: coluna(cab, v) for grupo in (TEXTO, SIM_NAO, ANO, ESCALA, LISTA, DATA) for k, v in grupo.items()}
        col_id = coluna(cab, 'Id do professor')
        linhas = list(leitor)

    campos = list(TEXTO) + list(SIM_NAO) + list(ANO) + list(ESCALA) + list(LISTA) + list(DATA)
    # Cast explícito: uma coluna toda NULL no VALUES vira text e não entra em boolean/smallint.
    tipos = {**dict.fromkeys(TEXTO, 'text'), **dict.fromkeys(SIM_NAO, 'boolean'),
             **dict.fromkeys(ANO, 'smallint'), **dict.fromkeys(ESCALA, 'smallint'),
             **dict.fromkeys(LISTA, 'text[]'), **dict.fromkeys(DATA, 'timestamptz')}
    valores = []
    for r in linhas:
        kms = (r[col_id] or '').strip()
        if not kms.isdigit():
            continue
        v = [lit(kms)]
        v += [texto(r[mapa[k]]) for k in TEXTO]
        v += [sim_nao(r[mapa[k]]) for k in SIM_NAO]
        v += [ano(r[mapa['curso_conclusao_ano']], ANO_ATUAL + 10), ano(r[mapa['leciona_desde']], ANO_ATUAL)]
        v += [escala(r[mapa[k]]) for k in ESCALA]
        v += [lista(r[mapa[k]]) for k in LISTA]
        v += [data(r[mapa[k]]) for k in DATA]
        valores.append('  (' + ', '.join(v) + ')')

    nomes = ', '.join(campos)
    sets = ',\n  '.join(f'{c} = EXCLUDED.{c}' for c in campos + ['fonte', 'importado_em'])
    sql = (
        'BEGIN;\n'
        f'INSERT INTO professor_perfil (professor_id, {nomes}, fonte, importado_em)\n'
        f'SELECT p.id, {", ".join(f"v.{c}::{tipos[c]}" for c in campos)}, {lit(fonte)}, NOW()\n'
        'FROM (VALUES\n' + ',\n'.join(valores) + '\n'
        f') AS v(kms_id, {nomes})\n'
        'JOIN professores p ON p.kms_id = v.kms_id\n'
        'ON CONFLICT (professor_id) DO UPDATE SET\n  ' + sets + ';\n'
        'COMMIT;\n'
    )
    with open(saida, 'w', encoding='utf-8', newline='\n') as f:
        f.write(sql)
    print(f'{len(valores)} professores no CSV -> {saida}')


if __name__ == '__main__':
    main()
