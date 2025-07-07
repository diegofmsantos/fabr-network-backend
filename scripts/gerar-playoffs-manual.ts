// scripts/gerar-playoffs-manual.ts
// Script para gerar playoffs manualmente baseado nos resultados da temporada regular
// Executar: npx ts-node scripts/gerar-playoffs-manual.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface TimeClassificado {
  timeId: number
  time: {
    id: number
    nome: string
    sigla: string
    logo: string
  }
  vitorias: number
  derrotas: number
  pontosPro: number
  pontosContra: number
  saldo: number
  regional: string
  regionalTipo: string
  posicaoRegional: number
}

async function gerarPlayoffsManual(): Promise<void> {
  console.log('🏆 INICIANDO GERAÇÃO MANUAL DOS PLAYOFFS...\n')

  try {
    // 1. Buscar Superliga
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: '2025',
        isSuperliga: true
      }
    })

    if (!superliga) {
      console.error('❌ Superliga 2025 não encontrada!')
      return
    }

    console.log(`✅ Superliga encontrada: ${superliga.nome}`)

    // 2. Verificar se todos os jogos da temporada regular estão finalizados
    const jogosTemporadaRegular = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR'
      }
    })

    const jogosFinalizados = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR',
        status: 'FINALIZADO'
      }
    })

    console.log(`📊 Jogos da temporada regular: ${jogosFinalizados}/${jogosTemporadaRegular} finalizados`)

    if (jogosFinalizados < jogosTemporadaRegular) {
      console.log(`⚠️  Ainda há ${jogosTemporadaRegular - jogosFinalizados} jogos não finalizados`)
      console.log('💡 Gerando playoffs mesmo assim...')
    }

    // 3. Verificar se playoffs já existem
    const playoffsExistentes = await prisma.playoffJogo.count({
      where: { campeonatoId: superliga.id }
    })

    if (playoffsExistentes > 0) {
      console.log(`⚠️  Já existem ${playoffsExistentes} jogos de playoff`)
      const resposta = await new Promise<string>((resolve) => {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        })
        readline.question('Deseja limpar e recriar? (s/n): ', (answer: string) => {
          readline.close()
          resolve(answer.toLowerCase())
        })
      })

      if (resposta === 's' || resposta === 'sim') {
        await prisma.playoffJogo.deleteMany({
          where: { campeonatoId: superliga.id }
        })
        console.log('🗑️  Playoffs antigos removidos')
      } else {
        console.log('❌ Operação cancelada')
        return
      }
    }

    // 4. Buscar distribuição e calcular classificação
    const distribuicao = await prisma.distribuicaoTime.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        time: true,
        conferencia: true,
        regional: true
      }
    })

    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR',
        status: 'FINALIZADO'
      },
      include: {
        timeCasa: true,
        timeVisitante: true
      }
    })

    console.log(`📋 Calculando classificação com ${jogos.length} jogos finalizados...`)

    // 5. Calcular classificação por regional
    const classificacaoPorRegional = new Map<string, TimeClassificado[]>()

    // Agrupar times por regional
    const timesPorRegional = new Map<string, any[]>()
    distribuicao.forEach(dist => {
      const key = dist.regionalType
      if (!timesPorRegional.has(key)) {
        timesPorRegional.set(key, [])
      }
      timesPorRegional.get(key)!.push(dist)
    })

    // Calcular estatísticas para cada regional
    for (const [regionalTipo, timesRegional] of timesPorRegional) {
      const classificacao: TimeClassificado[] = []

      for (const dist of timesRegional) {
        const jogosTime = jogos.filter(j => 
          j.timeCasaId === dist.timeId || j.timeVisitanteId === dist.timeId
        )

        let vitorias = 0
        let derrotas = 0
        let pontosPro = 0
        let pontosContra = 0

        jogosTime.forEach(jogo => {
          const isTimeCasa = jogo.timeCasaId === dist.timeId
          const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
          const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

          pontosPro += pontosFeitos
          pontosContra += pontosSofridos

          if (pontosFeitos > pontosSofridos) {
            vitorias++
          } else if (pontosSofridos > pontosFeitos) {
            derrotas++
          }
        })

        classificacao.push({
          timeId: dist.timeId,
          time: {
            id: dist.time.id,
            nome: dist.time.nome,
            sigla: dist.time.sigla,
            logo: dist.time.logo
          },
          vitorias,
          derrotas,
          pontosPro,
          pontosContra,
          saldo: pontosPro - pontosContra,
          regional: dist.regional.nome,
          regionalTipo: regionalTipo,
          posicaoRegional: 0
        })
      }

      // Ordenar por vitórias, depois por saldo
      classificacao.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })

      // Definir posições
      classificacao.forEach((item, index) => {
        item.posicaoRegional = index + 1
      })

      classificacaoPorRegional.set(regionalTipo, classificacao)
      
      console.log(`\n🏆 ${regionalTipo}:`)
      classificacao.forEach(time => {
        console.log(`   ${time.posicaoRegional}º ${time.time.sigla} - ${time.vitorias}V ${time.derrotas}D (${time.saldo > 0 ? '+' : ''}${time.saldo})`)
      })
    }

    // 6. Gerar playoffs por conferência
    const conferencias = await prisma.conferencia.findMany({
      where: { campeonatoId: superliga.id },
      include: { regionais: true }
    })

    let totalPlayoffJogos = 0

    for (const conferencia of conferencias) {
      console.log(`\n🏟️  Gerando playoffs para ${conferencia.nome}...`)

      if (conferencia.tipo === 'CENTRO_NORTE') {
        // Centro-Norte: direto para semifinal (só 3 times por regional)
        const cerrado = classificacaoPorRegional.get('CERRADO') || []
        const amazonia = classificacaoPorRegional.get('AMAZONIA') || []

        if (cerrado.length > 0 && amazonia.length > 0) {
          // Semifinal 1: 1º Cerrado vs 2º Amazônia
          const semi1 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'SEMIFINAL_CONFERENCIA',
              rodada: 1,
              nome: `Semifinal ${conferencia.nome} 1`,
              timeClassificado1Id: cerrado[0]?.timeId,
              timeClassificado2Id: amazonia[1]?.timeId,
              status: 'AGUARDANDO'
            }
          })

          // Semifinal 2: 1º Amazônia vs 2º Cerrado
          const semi2 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'SEMIFINAL_CONFERENCIA',
              rodada: 1,
              nome: `Semifinal ${conferencia.nome} 2`,
              timeClassificado1Id: amazonia[0]?.timeId,
              timeClassificado2Id: cerrado[1]?.timeId,
              status: 'AGUARDANDO'
            }
          })

          // Final da conferência
          const final = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'FINAL_CONFERENCIA',
              rodada: 1,
              nome: `Final ${conferencia.nome}`,
              jogoAnterior1Id: semi1.id,
              jogoAnterior2Id: semi2.id,
              status: 'AGUARDANDO'
            }
          })

          console.log(`   ✅ ${conferencia.nome}: 3 jogos gerados`)
          totalPlayoffJogos += 3
        }

      } else {
        // Outras conferências: com wild cards
        const regionais = conferencia.regionais.map(r => r.tipo)
        const primeirosColocados: TimeClassificado[] = []
        const segundosColocados: TimeClassificado[] = []

        regionais.forEach(regionalTipo => {
          const classificacao = classificacaoPorRegional.get(regionalTipo) || []
          if (classificacao[0]) primeirosColocados.push(classificacao[0])
          if (classificacao[1]) segundosColocados.push(classificacao[1])
        })

        // Ordenar primeiros e segundos colocados
        primeirosColocados.sort((a, b) => {
          if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
          if (b.saldo !== a.saldo) return b.saldo - a.saldo
          return b.pontosPro - a.pontosPro
        })

        segundosColocados.sort((a, b) => {
          if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
          if (b.saldo !== a.saldo) return b.saldo - a.saldo
          return b.pontosPro - a.pontosPro
        })

        let jogosConferencia = 0

        if (primeirosColocados.length >= 2 && segundosColocados.length >= 2) {
          // Wild Cards
          const wc1 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'WILD_CARD',
              rodada: 1,
              nome: `Wild Card ${conferencia.nome} 1`,
              timeClassificado1Id: primeirosColocados[2]?.timeId || segundosColocados[0]?.timeId,
              timeClassificado2Id: segundosColocados[2]?.timeId || segundosColocados[1]?.timeId,
              status: 'AGUARDANDO'
            }
          })

          const wc2 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'WILD_CARD',
              rodada: 1,
              nome: `Wild Card ${conferencia.nome} 2`,
              timeClassificado1Id: segundosColocados[0]?.timeId,
              timeClassificado2Id: segundosColocados[1]?.timeId,
              status: 'AGUARDANDO'
            }
          })

          // Semifinais
          const semi1 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'SEMIFINAL_CONFERENCIA',
              rodada: 1,
              nome: `Semifinal ${conferencia.nome} 1`,
              timeClassificado1Id: primeirosColocados[0]?.timeId,
              jogoAnterior2Id: wc1.id,
              status: 'AGUARDANDO'
            }
          })

          const semi2 = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'SEMIFINAL_CONFERENCIA',
              rodada: 1,
              nome: `Semifinal ${conferencia.nome} 2`,
              timeClassificado1Id: primeirosColocados[1]?.timeId,
              jogoAnterior2Id: wc2.id,
              status: 'AGUARDANDO'
            }
          })

          // Final da conferência
          const final = await prisma.playoffJogo.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              fase: 'FINAL_CONFERENCIA',
              rodada: 1,
              nome: `Final ${conferencia.nome}`,
              jogoAnterior1Id: semi1.id,
              jogoAnterior2Id: semi2.id,
              status: 'AGUARDANDO'
            }
          })

          jogosConferencia = 5
        }

        console.log(`   ✅ ${conferencia.nome}: ${jogosConferencia} jogos gerados`)
        totalPlayoffJogos += jogosConferencia
      }
    }

    // 7. Gerar fase nacional (placeholder - será preenchida quando as finais de conferência terminarem)
    const semifinalNacional1 = await prisma.playoffJogo.create({
      data: {
        campeonatoId: superliga.id,
        fase: 'SEMIFINAL_NACIONAL',
        rodada: 1,
        nome: 'Semifinal Nacional 1',
        status: 'AGUARDANDO'
      }
    })

    const semifinalNacional2 = await prisma.playoffJogo.create({
      data: {
        campeonatoId: superliga.id,
        fase: 'SEMIFINAL_NACIONAL',
        rodada: 1,
        nome: 'Semifinal Nacional 2',
        status: 'AGUARDANDO'
      }
    })

    const finalNacional = await prisma.playoffJogo.create({
      data: {
        campeonatoId: superliga.id,
        fase: 'FINAL_NACIONAL',
        rodada: 1,
        nome: 'Grande Decisão Nacional',
        jogoAnterior1Id: semifinalNacional1.id,
        jogoAnterior2Id: semifinalNacional2.id,
        status: 'AGUARDANDO'
      }
    })

    totalPlayoffJogos += 3

    // 8. Atualizar status da Superliga
    await prisma.campeonato.update({
      where: { id: superliga.id },
      data: { status: 'PLAYOFFS' }
    })

    console.log('\n🎉 PLAYOFFS GERADOS COM SUCESSO!')
    console.log(`📊 Total de jogos de playoff criados: ${totalPlayoffJogos}`)
    console.log(`✅ Status da Superliga atualizado para: PLAYOFFS`)

    console.log('\n🚀 PRÓXIMOS PASSOS:')
    console.log('1. Acesse: http://localhost:3001/superliga/2025/wild-card')
    console.log('2. Acesse: http://localhost:3001/admin/superliga/playoffs')
    console.log('3. Verifique se todas as páginas estão funcionando')

  } catch (error) {
    console.error('❌ Erro ao gerar playoffs:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  gerarPlayoffsManual()
    .then(() => {
      console.log('\n🔚 Geração de playoffs concluída.')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro durante geração:', error)
      process.exit(1)
    })
}

export default gerarPlayoffsManual