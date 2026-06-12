import { PrismaClient } from '@prisma/client'
import { TIMES_SUPERLIGA } from '../config/superligaConfig'

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

    const campeonato = await prisma.campeonato.findUnique({
      where: { id: campeonatoId },
      select: { temporada: true }
    })

    const temporada = campeonato?.temporada

    if (!temporada) {
      throw new Error('Temporada do campeonato não encontrada')
    }

    const rankingGeral = []

    for (const regional of regionais) {
      const timesEsperados = TIMES_SUPERLIGA[regional.tipo as keyof typeof TIMES_SUPERLIGA]
      if (!timesEsperados) continue

      const times = await prisma.time.findMany({
        where: {
          nome: { in: timesEsperados },
          temporada
        }
      })

      const classificacaoRegional = []

      for (const time of times) {
        const jogos = await prisma.jogo.findMany({
          where: {
            campeonatoId,
            OR: [
              { timeCasaId: time.id },
              { timeVisitanteId: time.id }
            ],
            status: 'FINALIZADO'
          }
        })

        let vitorias = 0
        let derrotas = 0
        let pontosPro = 0
        let pontosContra = 0

        jogos.forEach(jogo => {
          const isTimeCasa = jogo.timeCasaId === time.id
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
          time: {
            id: time.id,
            nome: time.nome,
            sigla: time.sigla,
            logo: time.logo,
            cidade: time.cidade
          },
          timeId: time.id,
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
          eficiencia: jogos.length > 0 ? (pontosPro / (pontosPro + pontosContra)) * 100 : 0,
          posicaoRegional: 0, 
          posicaoGeral: 0 
        })
      }

      classificacaoRegional.sort((a, b) => {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
        if (b.saldo !== a.saldo) return b.saldo - a.saldo
        return b.pontosPro - a.pontosPro
      })

      classificacaoRegional.forEach((item: any, index) => {
        item.posicaoRegional = index + 1
      })

      rankingGeral.push(...classificacaoRegional)
    }

    rankingGeral.sort((a: any, b: any) => {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      return b.pontosPro - a.pontosPro
    })

    rankingGeral.forEach((item: any, index) => {
      item.posicaoGeral = index + 1
    })

    return {
      ranking: rankingGeral,
      estatisticas: {
        totalTimes: rankingGeral.length,
        totalJogos: rankingGeral.reduce((acc, item) => acc + item.jogos, 0) / 2, 
        maiorPontuacao: Math.max(...rankingGeral.map(item => item.pontosPro)),
        menorPontuacao: Math.min(...rankingGeral.map(item => item.pontosPro)),
        mediaPontos: rankingGeral.length > 0 
          ? rankingGeral.reduce((acc, item) => acc + item.pontosPro, 0) / rankingGeral.length 
          : 0,
        mediaVitorias: rankingGeral.length > 0 
          ? rankingGeral.reduce((acc, item) => acc + item.vitorias, 0) / rankingGeral.length 
          : 0,
        mediaAtaque: rankingGeral.length > 0 
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

    const campeonato = await prisma.campeonato.findUnique({
      where: { id: campeonatoId },
      select: { temporada: true }
    })

    const temporada = campeonato?.temporada

    if (!temporada) {
      throw new Error('Temporada do campeonato não encontrada')
    }

    const wildCardRanking = {
      primeiroColocados: [] as any[],
      segundoColocados: [] as any[],
      terceiroColocados: [] as any[]
    }

    for (const regional of conf.regionais) {
      const timesEsperados = TIMES_SUPERLIGA[regional.tipo as keyof typeof TIMES_SUPERLIGA]
      if (!timesEsperados) continue

      const times = await prisma.time.findMany({
        where: {
          nome: { in: timesEsperados },
          temporada
        }
      })

      const classificacaoRegional = []

      for (const time of times) {
        const jogos = await prisma.jogo.findMany({
          where: {
            campeonatoId,
            OR: [
              { timeCasaId: time.id },
              { timeVisitanteId: time.id }
            ],
            status: 'FINALIZADO'
          }
        })

        let vitorias = 0
        let pontosPro = 0
        let pontosContra = 0

        jogos.forEach(jogo => {
          const isTimeCasa = jogo.timeCasaId === time.id
          const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
          const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

          pontosPro += pontosFeitos
          pontosContra += pontosSofridos

          if (pontosFeitos > pontosSofridos) {
            vitorias++
          }
        })

        classificacaoRegional.push({
          time: {
            id: time.id,
            nome: time.nome,
            sigla: time.sigla,
            logo: time.logo
          },
          timeId: time.id,
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

    const ordenarPorCriterio = (a: any, b: any) => {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      return b.pontosPro - a.pontosPro
    }

    wildCardRanking.primeiroColocados.sort(ordenarPorCriterio)
    wildCardRanking.segundoColocados.sort(ordenarPorCriterio)
    wildCardRanking.terceiroColocados.sort(ordenarPorCriterio)

    return wildCardRanking

  } catch (error) {
    console.error('Erro ao obter ranking de wild card:', error)
    throw error
  }
}