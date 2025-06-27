import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function calcularRankingGeral(campeonatoId: number) {
  try {
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
          mediaAtaque: jogos.length > 0 ? pontosPro / jogos.length : 0,
          mediaDefesa: jogos.length > 0 ? pontosContra / jogos.length : 0,
          eficiencia: jogos.length > 0 ? (pontosPro - pontosContra) / jogos.length : 0,
          posicaoRegional: 0
        })
      }

      classificacaoRegional.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })

      classificacaoRegional.forEach((item, index) => {
        item.posicaoRegional = index + 1
      })

      rankingGeral.push(...classificacaoRegional)
    }

    rankingGeral.sort((a, b) => {
      if (a.posicaoRegional !== b.posicaoRegional) {
        return a.posicaoRegional - b.posicaoRegional
      }
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.eficiencia !== a.eficiencia) return b.eficiencia - a.eficiencia
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      return b.pontosPro - a.pontosPro
    })

    rankingGeral.forEach((item, index) => {
      (item as any).posicaoGeral = index + 1
    })

    return {
      ranking: rankingGeral,
      estatisticas: {
        totalTimes: rankingGeral.length,
        jogosAnalisados: rankingGeral.reduce((acc, item) => acc + item.jogos, 0),
        mediaGolsPorJogo: rankingGeral.length > 0 
          ? rankingGeral.reduce((acc, item) => acc + item.mediaAtaque, 0) / rankingGeral.length 
          : 0
      }
    }

  } catch (error) {
    console.error('Erro ao calcular ranking geral:', error)
    throw error
  }
}

export async function getWildCardRanking(campeonatoId: number, conferencia: string) {
  try {
    const conf = await prisma.conferencia.findFirst({
      where: {
        campeonatoId,
        tipo: conferencia
      },
      include: {
        regionais: {
          include: {
            conferencia: true
          }
        }
      }
    })

    if (!conf) {
      throw new Error(`Conferência ${conferencia} não encontrada`)
    }

    const wildCardRanking = {
      primeiroColocados: [] as any[],
      segundoColocados: [] as any[],
      terceiroColocados: [] as any[]
    }

    for (const regional of conf.regionais) {
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
          }
        })

        classificacaoRegional.push({
          time: grupoTime.time,
          timeId: grupoTime.timeId,
          regional: regional.tipo,
          jogos: jogos.length,
          vitorias,
          pontosPro,
          pontosContra,
          saldo: pontosPro - pontosContra,
          aproveitamento: jogos.length > 0 ? (vitorias / jogos.length) * 100 : 0
        })
      }

      classificacaoRegional.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })

      if (classificacaoRegional[0]) {
        wildCardRanking.primeiroColocados.push({
          ...classificacaoRegional[0],
          posicaoRegional: 1
        })
      }
      if (classificacaoRegional[1]) {
        wildCardRanking.segundoColocados.push({
          ...classificacaoRegional[1],
          posicaoRegional: 2
        })
      }
      if (classificacaoRegional[2]) {
        wildCardRanking.terceiroColocados.push({
          ...classificacaoRegional[2],
          posicaoRegional: 3
        })
      }
    }

    const ordenarPorCriterios = (a: any, b: any) => {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      return b.pontosPro - a.pontosPro
    }

    wildCardRanking.primeiroColocados.sort(ordenarPorCriterios)
    wildCardRanking.segundoColocados.sort(ordenarPorCriterios)
    wildCardRanking.terceiroColocados.sort(ordenarPorCriterios)

    return wildCardRanking

  } catch (error) {
    console.error('Erro ao calcular wild card ranking:', error)
    throw error
  }
}

export async function gerarSemifinaisNacionais(campeonatoId: number) {
  try {
    const finaisConferencia = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId,
        fase: 'FINAL_CONFERENCIA',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true,
        conferencia: true
      }
    })

    if (finaisConferencia.length !== 4) {
      throw new Error(`Nem todas as conferências finalizaram seus playoffs. Finalizadas: ${finaisConferencia.length}/4`)
    }

    const semifinaisExistentes = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId,
        fase: 'SEMIFINAL_NACIONAL'
      }
    })

    if (semifinaisExistentes.length > 0) {
      throw new Error('Semifinais nacionais já foram geradas')
    }

    const campeoes = finaisConferencia.map(final => ({
      conferencia: final.conferencia?.tipo,
      timeId: final.timeVencedorId,
      time: final.timeVencedor
    }))

    const campeaoSudeste = campeoes.find(c => c.conferencia === 'SUDESTE')
    const campeaoSul = campeoes.find(c => c.conferencia === 'SUL')
    const campeaoNordeste = campeoes.find(c => c.conferencia === 'NORDESTE')
    const campeaoCentroNorte = campeoes.find(c => c.conferencia === 'CENTRO_NORTE')

    if (!campeaoSudeste || !campeaoSul || !campeaoNordeste || !campeaoCentroNorte) {
      throw new Error('Nem todos os campeões de conferência foram encontrados')
    }

    const ultimaFinal = finaisConferencia
      .filter(f => f.dataJogo)
      .sort((a, b) => new Date(b.dataJogo!).getTime() - new Date(a.dataJogo!).getTime())[0]

    const dataBase = ultimaFinal?.dataJogo 
      ? new Date(new Date(ultimaFinal.dataJogo).getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const semifinal1 = await prisma.playoffJogo.create({
      data: {
        campeonatoId,
        conferenciaId: null, 
        fase: 'SEMIFINAL_NACIONAL',
        rodada: 1,
        nome: 'Semifinal Nacional 1: Sul × Sudeste',
        timeClassificado1Id: campeaoSul.timeId,
        timeClassificado2Id: campeaoSudeste.timeId,
        dataJogo: dataBase,
        status: 'AGUARDANDO'
      }
    })

    const dataSemifinal2 = new Date(dataBase)
    dataSemifinal2.setHours(dataBase.getHours() + 3) 

    const semifinal2 = await prisma.playoffJogo.create({
      data: {
        campeonatoId,
        conferenciaId: null,
        fase: 'SEMIFINAL_NACIONAL',
        rodada: 1,
        nome: 'Semifinal Nacional 2: Nordeste × Centro-Norte',
        timeClassificado1Id: campeaoNordeste.timeId,
        timeClassificado2Id: campeaoCentroNorte.timeId,
        dataJogo: dataSemifinal2,
        status: 'AGUARDANDO'
      }
    })

    return {
      semifinal1: {
        id: semifinal1.id,
        nome: semifinal1.nome,
        time1: campeaoSul.time,
        time2: campeaoSudeste.time,
        dataJogo: semifinal1.dataJogo
      },
      semifinal2: {
        id: semifinal2.id,
        nome: semifinal2.nome,
        time1: campeaoNordeste.time,
        time2: campeaoCentroNorte.time,
        dataJogo: semifinal2.dataJogo
      },
      campeoes: {
        sul: campeaoSul.time,
        sudeste: campeaoSudeste.time,
        nordeste: campeaoNordeste.time,
        centroNorte: campeaoCentroNorte.time
      }
    }

  } catch (error) {
    console.error('Erro ao gerar semifinais nacionais:', error)
    throw error
  }
}

export async function gerarFinalNacional(campeonatoId: number) {
  try {
    const semifinaisNacionais = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId,
        fase: 'SEMIFINAL_NACIONAL',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true
      }
    })

    if (semifinaisNacionais.length !== 2) {
      throw new Error(`Nem todas as semifinais nacionais foram finalizadas. Finalizadas: ${semifinaisNacionais.length}/2`)
    }

    const finalExistente = await prisma.playoffJogo.findFirst({
      where: {
        campeonatoId,
        fase: 'FINAL_NACIONAL'
      }
    })

    if (finalExistente) {
      throw new Error('Final nacional já foi gerada')
    }

    const vencedorSemifinal1 = semifinaisNacionais[0].timeVencedor
    const vencedorSemifinal2 = semifinaisNacionais[1].timeVencedor

    if (!vencedorSemifinal1 || !vencedorSemifinal2) {
      throw new Error('Vencedores das semifinais não encontrados')
    }

    const ultimaSemifinal = semifinaisNacionais
      .filter(sf => sf.dataJogo)
      .sort((a, b) => new Date(b.dataJogo!).getTime() - new Date(a.dataJogo!).getTime())[0]

    const dataFinal = ultimaSemifinal?.dataJogo 
      ? new Date(new Date(ultimaSemifinal.dataJogo).getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

    const finalNacional = await prisma.playoffJogo.create({
      data: {
        campeonatoId,
        conferenciaId: null,
        fase: 'FINAL_NACIONAL',
        rodada: 1,
        nome: 'Grande Final Nacional - Superliga',
        timeClassificado1Id: vencedorSemifinal1.id,
        timeClassificado2Id: vencedorSemifinal2.id,
        jogoAnterior1Id: semifinaisNacionais[0].id,
        jogoAnterior2Id: semifinaisNacionais[1].id,
        dataJogo: dataFinal,
        status: 'AGUARDANDO'
      }
    })

    return {
      final: {
        id: finalNacional.id,
        nome: finalNacional.nome,
        time1: vencedorSemifinal1,
        time2: vencedorSemifinal2,
        dataJogo: finalNacional.dataJogo
      },
      semifinais: semifinaisNacionais.map(sf => ({
        id: sf.id,
        nome: sf.nome,
        vencedor: sf.timeVencedor
      }))
    }

  } catch (error) {
    console.error('Erro ao gerar final nacional:', error)
    throw error
  }
}

export async function getFaseNacional(campeonatoId: number) {
  try {
    const jogosNacionais = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId,
        fase: {
          in: ['SEMIFINAL_NACIONAL', 'FINAL_NACIONAL']
        }
      },
      include: {
        timeClassificado1: true,
        timeClassificado2: true,
        timeVencedor: true
      },
      orderBy: [
        { fase: 'asc' },
        { rodada: 'asc' }
      ]
    })

    const semifinais = jogosNacionais.filter(j => j.fase === 'SEMIFINAL_NACIONAL')
    const final = jogosNacionais.find(j => j.fase === 'FINAL_NACIONAL')

    const semifinaisCompletas = semifinais.length === 2 && semifinais.every(sf => sf.status === 'FINALIZADO')
    const finalCompleta = final?.status === 'FINALIZADO'
    const campeaoNacional = finalCompleta ? final?.timeVencedor : null

    const finaisConferencia = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId,
        fase: 'FINAL_CONFERENCIA',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true,
        conferencia: true
      }
    })

    const campeoesPorConferencia = finaisConferencia.reduce((acc, final) => {
      if (final.conferencia?.tipo && final.timeVencedor) {
        acc[final.conferencia.tipo] = final.timeVencedor
      }
      return acc
    }, {} as Record<string, any>)

    return {
      campeonatoId,
      status: finalCompleta ? 'FINALIZADO' : semifinaisCompletas ? 'FINAL_NACIONAL' : 'SEMIFINAIS_NACIONAIS',
      
      semifinais: semifinais.map(sf => ({
        id: sf.id,
        nome: sf.nome,
        time1: sf.timeClassificado1,
        time2: sf.timeClassificado2,
        vencedor: sf.timeVencedor,
        dataJogo: sf.dataJogo,
        status: sf.status,
        placarTime1: sf.placarTime1,
        placarTime2: sf.placarTime2
      })),
      
      final: final ? {
        id: final.id,
        nome: final.nome,
        time1: final.timeClassificado1,
        time2: final.timeClassificado2,
        vencedor: final.timeVencedor,
        dataJogo: final.dataJogo,
        status: final.status,
        placarTime1: final.placarTime1,
        placarTime2: final.placarTime2
      } : null,
      
      estatisticas: {
        semifinaisCompletas,
        finalCompleta,
        campeaoNacional,
        totalJogos: jogosNacionais.length,
        jogosFinalizados: jogosNacionais.filter(j => j.status === 'FINALIZADO').length
      },
      
      campeoesPorConferencia
    }

  } catch (error) {
    console.error('Erro ao buscar fase nacional:', error)
    throw error
  }
}