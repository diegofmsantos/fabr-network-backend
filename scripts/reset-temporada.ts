/**
 * reset-temporada.ts
 *
 * Apaga TODOS os dados de UMA temporada específica (padrão: 2026),
 * preservando integralmente as outras temporadas (ex.: 2025) e as matérias.
 *
 * Diferenças cruciais em relação ao reset-sequences.ts:
 *   - NÃO reseta nenhuma sequence (resetar IDs com dados de outras temporadas
 *     no banco causaria colisão de IDs e corromperia referências).
 *   - NÃO apaga a tabela Jogador (a "pessoa"): um jogador pode atuar em 2025 e
 *     2026 sendo a MESMA linha, com vínculos JogadorTime distintos por temporada.
 *     Removemos apenas o vínculo JogadorTime da temporada-alvo. Jogadores que
 *     ficarem órfãos permanecem no banco (invisíveis no site) — comportamento
 *     seguro escolhido para nunca afetar 2025.
 *   - Roda em DRY-RUN por padrão: só CONTA o que seria apagado. Para apagar de
 *     verdade, passe --confirm.
 *   - Tudo dentro de uma única transação: ou apaga a temporada inteira, ou nada.
 *
 * Uso (Windows PowerShell, na pasta do backend):
 *   npx tsx scripts/reset-temporada.ts                      # dry-run, alvo 2026
 *   npx tsx scripts/reset-temporada.ts --confirm            # apaga de verdade o 2026
 *   npx tsx scripts/reset-temporada.ts --temporada=2026     # escolhe a temporada (dry-run)
 *   npx tsx scripts/reset-temporada.ts --temporada=2026 --confirm
 *   npx tsx scripts/reset-temporada.ts --help
 *
 * Trava de segurança: apagar a temporada '2025' exige a flag extra
 * --permitir-2025 (evita rodar contra a produção por engano).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ---------- Parse de argumentos ----------
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📖 reset-temporada.ts — apaga só UMA temporada, preservando as demais e as matérias

  npx tsx scripts/reset-temporada.ts                   # DRY-RUN (só conta), alvo 2026
  npx tsx scripts/reset-temporada.ts --confirm         # APAGA de verdade o 2026
  npx tsx scripts/reset-temporada.ts --temporada=2027  # escolhe outra temporada
  npx tsx scripts/reset-temporada.ts --temporada=2025 --permitir-2025 --confirm

🔒 Segurança:
  - DRY-RUN por padrão. Nada é apagado sem --confirm.
  - Não reseta sequences. Não apaga matérias. Não toca em outras temporadas.
  - Apagar 2025 exige --permitir-2025 (anti-engano).
`)
  process.exit(0)
}

const temporadaArg = args.find(a => a.startsWith('--temporada='))
const TEMPORADA = (temporadaArg ? temporadaArg.split('=')[1] : '2026').trim()
const CONFIRM = args.includes('--confirm')
const PERMITIR_2025 = args.includes('--permitir-2025')

async function resetTemporada() {
  console.log('═'.repeat(60))
  console.log(`🎯 Alvo: temporada ${TEMPORADA}`)
  console.log(`🧪 Modo: ${CONFIRM ? '⚠️  EXECUÇÃO REAL (--confirm)' : '🔍 DRY-RUN (nada será apagado)'}`)
  console.log('═'.repeat(60))

  if (!TEMPORADA) {
    console.error('❌ Temporada inválida. Use --temporada=2026')
    return
  }

  if (TEMPORADA === '2025' && !PERMITIR_2025) {
    console.error('🛑 BLOQUEADO: apagar a temporada 2025 exige a flag --permitir-2025.')
    console.error('   Isso existe para evitar apagar a produção por engano.')
    return
  }

  try {
    // 1) Localiza os campeonatos da temporada (Superliga e/ou outros).
    //    Conferencia/Regional não têm coluna "temporada": só conseguimos
    //    alcançá-las pela relação com o campeonato desta temporada.
    const campeonatos = await prisma.campeonato.findMany({
      where: { temporada: TEMPORADA },
      select: { id: true, nome: true, isSuperliga: true }
    })
    const campeonatoIds = campeonatos.map(c => c.id)

    console.log(`\n📋 Campeonatos encontrados em ${TEMPORADA}: ${campeonatos.length}`)
    campeonatos.forEach(c => console.log(`   - [${c.id}] ${c.nome}${c.isSuperliga ? ' (Superliga)' : ''}`))

    // 2) Conta tudo que será removido (vale para dry-run e para o log final).
    const [
      estatisticasCount,
      jogosCount,
      distribuicaoCount,
      jogadorTimeCount,
      timesCount,
    ] = await Promise.all([
      prisma.estatisticaJogo.count({ where: { temporada: TEMPORADA } }),
      prisma.jogo.count({ where: { temporada: TEMPORADA } }),
      prisma.distribuicaoTime.count({ where: { temporada: TEMPORADA } }),
      prisma.jogadorTime.count({ where: { temporada: TEMPORADA } }),
      prisma.time.count({ where: { temporada: TEMPORADA } }),
    ])

    const regionaisCount = campeonatoIds.length
      ? await prisma.regional.count({ where: { conferencia: { campeonatoId: { in: campeonatoIds } } } })
      : 0
    const conferenciasCount = campeonatoIds.length
      ? await prisma.conferencia.count({ where: { campeonatoId: { in: campeonatoIds } } })
      : 0

    console.log('\n🔢 Registros que serão removidos:')
    console.log(`   EstatisticaJogo : ${estatisticasCount}`)
    console.log(`   Jogo            : ${jogosCount}`)
    console.log(`   DistribuicaoTime: ${distribuicaoCount}`)
    console.log(`   Regional        : ${regionaisCount}`)
    console.log(`   Conferencia     : ${conferenciasCount}`)
    console.log(`   JogadorTime     : ${jogadorTimeCount}  (vínculos; a pessoa Jogador é preservada)`)
    console.log(`   Time            : ${timesCount}`)
    console.log(`   Campeonato      : ${campeonatos.length}`)

    const totalAlvo =
      estatisticasCount + jogosCount + distribuicaoCount + regionaisCount +
      conferenciasCount + jogadorTimeCount + timesCount + campeonatos.length

    if (totalAlvo === 0) {
      console.log(`\n✅ Nada encontrado para a temporada ${TEMPORADA}. Banco já está limpo dessa temporada.`)
      return
    }

    if (!CONFIRM) {
      console.log('\n🔍 DRY-RUN: nada foi apagado.')
      console.log('   Para executar de verdade, repita o comando adicionando --confirm')
      await mostrarResumoOutrasTemporadas()
      return
    }

    // 3) EXECUÇÃO REAL — tudo dentro de uma transação.
    //    Ordem respeitando as foreign keys (filho -> pai).
    console.log('\n🧹 Apagando (transação única)...')

    const resultado = await prisma.$transaction(async (tx) => {
      const est = await tx.estatisticaJogo.deleteMany({ where: { temporada: TEMPORADA } })
      const jog = await tx.jogo.deleteMany({ where: { temporada: TEMPORADA } })
      const dist = await tx.distribuicaoTime.deleteMany({ where: { temporada: TEMPORADA } })

      const reg = campeonatoIds.length
        ? await tx.regional.deleteMany({ where: { conferencia: { campeonatoId: { in: campeonatoIds } } } })
        : { count: 0 }
      const conf = campeonatoIds.length
        ? await tx.conferencia.deleteMany({ where: { campeonatoId: { in: campeonatoIds } } })
        : { count: 0 }

      const jt = await tx.jogadorTime.deleteMany({ where: { temporada: TEMPORADA } })
      const tim = await tx.time.deleteMany({ where: { temporada: TEMPORADA } })
      const camp = await tx.campeonato.deleteMany({ where: { temporada: TEMPORADA } })

      return {
        estatisticas: est.count,
        jogos: jog.count,
        distribuicao: dist.count,
        regionais: reg.count,
        conferencias: conf.count,
        jogadorTime: jt.count,
        times: tim.count,
        campeonatos: camp.count,
      }
    })

    console.log('\n✅ Removido com sucesso:')
    console.log(`   EstatisticaJogo : ${resultado.estatisticas}`)
    console.log(`   Jogo            : ${resultado.jogos}`)
    console.log(`   DistribuicaoTime: ${resultado.distribuicao}`)
    console.log(`   Regional        : ${resultado.regionais}`)
    console.log(`   Conferencia     : ${resultado.conferencias}`)
    console.log(`   JogadorTime     : ${resultado.jogadorTime}`)
    console.log(`   Time            : ${resultado.times}`)
    console.log(`   Campeonato      : ${resultado.campeonatos}`)

    console.log(`\n🎉 Temporada ${TEMPORADA} zerada com sucesso!`)
    console.log('   Sequences NÃO foram tocadas. Matérias preservadas. Demais temporadas intactas.')

    await mostrarResumoOutrasTemporadas()

  } catch (error) {
    console.error('\n❌ Erro ao resetar a temporada (transação revertida, nada foi apagado):', error)
    if (error instanceof Error) console.error('📝 Detalhes:', error.message)
  } finally {
    await prisma.$disconnect()
    console.log('\n🔌 Conexão encerrada')
  }
}

/**
 * Mostra o que permanece no banco para as OUTRAS temporadas — prova visual
 * de que 2025 (e matérias) continua intacto.
 */
async function mostrarResumoOutrasTemporadas() {
  const [timesOutras, jogosOutras, materias] = await Promise.all([
    prisma.time.groupBy({ by: ['temporada'], _count: { id: true } }),
    prisma.jogo.groupBy({ by: ['temporada'], _count: { id: true } }),
    prisma.materia.count(),
  ])

  console.log('\n📊 Estado do banco (todas as temporadas):')
  console.log('   Times por temporada:')
  timesOutras
    .sort((a, b) => String(a.temporada).localeCompare(String(b.temporada)))
    .forEach(t => console.log(`      ${t.temporada}: ${t._count.id} times`))

  console.log('   Jogos por temporada:')
  jogosOutras
    .sort((a, b) => String(a.temporada).localeCompare(String(b.temporada)))
    .forEach(j => console.log(`      ${j.temporada ?? 'sem-temporada'}: ${j._count.id} jogos`))

  console.log(`   📰 Matérias: ${materias} (sempre preservadas)`)
}

resetTemporada()