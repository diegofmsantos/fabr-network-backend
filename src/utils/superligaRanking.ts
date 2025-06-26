import { prisma } from "../libs/prisma"


export async function calcularRankingGeral(campeonatoId: number) {
  try {
    // Buscar todas as classificações por regional
    const regionais = await prisma.regional.findMany({
      where: {
        conferencia: { campeonatoId }
      },
      include: {
        conferencia: true
      }
    })

    const rankingGeral = []

    for (const regional of regionais) {
      // Buscar grupo do regional
      const grupo = await prisma.grupo.findFirst({
        where: {
          campeonatoId,
          regionalId: regional.id
        },
        include: {
          times: {
            include: { time: true }
          }
        }
      })

      if (!grupo) continue

      // Calcular classificação do regional
      const classificacaoRegional = []

      for (const grupoTime of grupo.times) {
        const jogos = await prisma.jogo.findMany({
          where: {
            campeonatoId,
            OR: [
              { timeCasaId: grupoTime.timeId },
              { timeVisitanteId: grupoTime.timeId }
            ],
            status: 'FINALIZADO'
          }
        })

        let vitorias = 0
        let derrotas = 0
        let pontosPro = 0
        let pontosContra = 0

        jogos.forEach(jogo => {
          const isTimeCasa = jogo.timeCasaId === grupoTime.timeId
          const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
          const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

          pontosPro += pontosFeitos
          pontosContra += pontosSofridos

          if (pontosFeitos > pontosSofridos) {
            vitorias++
          } else {
            derrotas++
          }
        })

        classificacaoRegional.push({
          time: grupoTime.time,
          timeId: grupoTime.timeId,
          regional: regional.tipo,
          conferencia: regional.conferencia.tipo,
          jogos: jogos.length,
          vitorias,
          derrotas,
          pontosPro,
          pontosContra,
          saldo: pontosPro - pontosContra,
          aproveitamento: jogos.length > 0 ? (vitorias / jogos.length) * 100 : 0,
          // Critérios específicos para ranking geral
          mediaAtaque: jogos.length > 0 ? pontosPro / jogos.length : 0,
          mediaDefesa: jogos.length > 0 ? pontosContra / jogos.length : 0,
          eficiencia: jogos.length > 0 ? (pontosPro - pontosContra) / jogos.length : 0
        })
      }

      // Ordenar dentro do regional
      classificacaoRegional.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })

      // Adicionar posição no regional
      classificacaoRegional.forEach((item, index) => {
        item.posicaoRegional = index + 1
      })

      rankingGeral.push(...classificacaoRegional)
    }

    // Ordenar ranking geral
    rankingGeral.sort((a, b) => {
      // 1. Primeira posição no regional vale mais
      if (a.posicaoRegional !== b.posicaoRegional) {
        return a.posicaoRegional - b.posicaoRegional
      }
      // 2. Número de vitórias
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      // 3. Eficiência (média de saldo por jogo)
      if (b.eficiencia !== a.eficiencia) return b.eficiencia - a.eficiencia
      // 4. Saldo de pontos
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      // 5. Pontos marcados
      return b.pontosPro - a.pontosPro
    })

    // Adicionar posição geral
    rankingGeral.forEach((item, index) => {
      item.posicaoGeral = index + 1
    })

    // Agrupar por conferência
    const rankingPorConferencia = rankingGeral.reduce((acc, time) => {
      if (!acc[time.conferencia]) acc[time.conferencia] = []
      acc[time.conferencia].push(time)
      return acc
    }, {} as Record<string, any[]>)

    return {
      rankingGeral,
      rankingPorConferencia,
      estatisticas: {
        totalTimes: rankingGeral.length,
        timesPorConferencia: Object.keys(rankingPorConferencia).reduce((acc, conf) => {
          acc[conf] = rankingPorConferencia[conf].length
          return acc
        }, {} as Record<string, number>),
        criteriosOrdenacao: [
          'Posição no Regional',
          'Número de Vitórias', 
          'Eficiência (Saldo/Jogo)',
          'Saldo de Pontos',
          'Pontos Marcados'
        ]
      }
    }

  } catch (error) {
    console.error('Erro ao calcular ranking geral:', error)
    throw error
  }
}

export async function getWildCardRanking(campeonatoId: number, conferencia: string) {
  try {
    const ranking = await calcularRankingGeral(campeonatoId)
    const timesConferencia = ranking.rankingPorConferencia[conferencia] || []

    // Para Wild Card, separar por posição no regional
    const primeirosColocados = timesConferencia.filter(t => t.posicaoRegional === 1)
    const segundosColocados = timesConferencia.filter(t => t.posicaoRegional === 2)
    const terceirosColocados = timesConferencia.filter(t => t.posicaoRegional === 3)

    // Ordenar cada grupo pelos critérios de desempate
    const ordenarPorCriterios = (times: any[]) => {
      return times.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.eficiencia !== a.eficiencia) return b.eficiencia - a.eficiencia
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })
    }

    return {
      primeirosColocados: ordenarPorCriterios(primeirosColocados),
      segundosColocados: ordenarPorCriterios(segundosColocados),
      terceirosColocados: ordenarPorCriterios(terceirosColocados),
      criteriosWildCard: {
        sudeste: {
          semifinalDireta: 'Melhor 1º e 2º melhores 1º colocados',
          wildCard: '3º melhor 1º × 3º melhor 2º, 1º melhor 2º × 2º melhor 2º'
        },
        sul: {
          semifinalDireta: '1º colocado de cada regional',
          wildCard: '2º colocado cruzado × 3º colocado'
        },
        nordeste: {
          semifinalDireta: '1º e 2º colocados do regional',
          wildCard: '3º × 6º, 4º × 5º'
        },
        centroNorte: {
          semifinalDireta: '1º de cada regional × 2º do outro',
          wildCard: 'Não possui'
        }
      }
    }

  } catch (error) {
    console.error('Erro ao calcular ranking wild card:', error)
    throw error
  }
}