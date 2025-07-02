import { PrismaClient } from '@prisma/client'
import { TIMES_SUPERLIGA } from '../types'

const prisma = new PrismaClient()

export async function gerarJogosTemporadaRegular(campeonatoId: number) {
  try {
    const superliga = await prisma.campeonato.findUnique({
      where: { id: campeonatoId },
      include: {
        conferencias: {
          include: {
            regionais: true
          }
        }
      }
    })

    if (!superliga) {
      throw new Error('Superliga não encontrada')
    }

    const { temporada } = superliga
    
    const todosTimes = await prisma.time.findMany({
      where: { temporada }
    })

    if (todosTimes.length !== 32) {
      throw new Error(`Esperados 32 times, encontrados ${todosTimes.length}`)
    }

    const timesPorRegional: { [key: string]: any[] } = {}
    
    for (const [regionalTipo, nomesEsperados] of Object.entries(TIMES_SUPERLIGA)) {
      const timesDoRegional = todosTimes.filter(time => 
        nomesEsperados.includes(time.nome)
      )
      timesPorRegional[regionalTipo] = timesDoRegional
    }

    const jogosIntraRegionais = await gerarJogosIntraRegionais(
      campeonatoId, 
      timesPorRegional, 
      new Date('2025-07-05'),
      7 
    )

    const jogosInterRegionais = await gerarJogosInterRegionais(
      campeonatoId,
      timesPorRegional,
      new Date('2025-08-15'),
      10 
    )

    const todosJogos = [...jogosIntraRegionais, ...jogosInterRegionais]

    await prisma.jogo.createMany({
      data: todosJogos
    })

    return {
      totalJogos: todosJogos.length,
      jogosIntraRegionais: jogosIntraRegionais.length,
      jogosInterRegionais: jogosInterRegionais.length,
      jogosGerados: todosJogos.length
    }

  } catch (error) {
    console.error('Erro ao gerar jogos da temporada regular:', error)
    throw error
  }
}

async function gerarJogosIntraRegionais(
  campeonatoId: number,
  timesPorRegional: { [key: string]: any[] },
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosIntraRegionais = []
  let dataAtual = new Date(dataInicio)
  let rodadaAtual = 1

  for (const [regionalTipo, times] of Object.entries(timesPorRegional)) {
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        const timeA = times[i]
        const timeB = times[j]

        const [timeCasa, timeVisitante] = Math.random() > 0.5 ? [timeA, timeB] : [timeB, timeA]

        const jogo = {
          campeonatoId,
          timeCasaId: timeCasa.id,
          timeVisitanteId: timeVisitante.id,
          dataJogo: new Date(dataAtual),
          rodada: rodadaAtual,
          fase: 'TEMPORADA_REGULAR',
          status: 'AGENDADO',
          local: timeCasa.estadio || `Estádio ${timeCasa.cidade}`,
          observacoes: `Regional ${regionalTipo}`
        }

        jogosIntraRegionais.push(jogo)

        dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
        
        if (jogosIntraRegionais.length % 8 === 0) {
          rodadaAtual++
        }
      }
    }
  }

  return jogosIntraRegionais
}

async function gerarJogosInterRegionais(
  campeonatoId: number,
  timesPorRegional: { [key: string]: any[] },
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosInterRegionais = []
  let dataAtual = new Date(dataInicio)
  let contadorJogo = 0

  const regionais = Object.keys(timesPorRegional)

  for (let i = 0; i < regionais.length; i++) {
    for (let j = i + 1; j < regionais.length; j++) {
      const regionalA = regionais[i]
      const regionalB = regionais[j]
      
      const timesA = timesPorRegional[regionalA]
      const timesB = timesPorRegional[regionalB]

      const mesmaConferencia = await verificarMesmaConferencia(regionalA, regionalB)
      
      if (mesmaConferencia) {
        const numJogos = Math.min(2, timesA.length, timesB.length)
        
        for (let k = 0; k < numJogos; k++) {
          const timeA = timesA[k % timesA.length]
          const timeB = timesB[k % timesB.length]

          const [timeCasa, timeVisitante] = Math.random() > 0.5 ? [timeA, timeB] : [timeB, timeA]

          const jogo = {
            campeonatoId,
            timeCasaId: timeCasa.id,
            timeVisitanteId: timeVisitante.id,
            dataJogo: new Date(dataAtual),
            rodada: Math.floor(contadorJogo / 8) + 3, 
            fase: 'TEMPORADA_REGULAR',
            status: 'AGENDADO',
            local: timeCasa.estadio || `Estádio ${timeCasa.cidade}`,
            observacoes: `Interregional: ${regionalA} × ${regionalB}`
          }

          jogosInterRegionais.push(jogo)
          contadorJogo++

          if (contadorJogo % 6 === 0) {
            dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
          }
        }
      }
    }
  }

  return jogosInterRegionais
}

async function verificarMesmaConferencia(regionalA: string, regionalB: string): Promise<boolean> {
  try {
    const regionalInfoA = await prisma.regional.findFirst({
      where: { tipo: regionalA },
      include: { conferencia: true }
    })

    const regionalInfoB = await prisma.regional.findFirst({
      where: { tipo: regionalB },
      include: { conferencia: true }
    })

    return regionalInfoA?.conferencia?.tipo === regionalInfoB?.conferencia?.tipo
  } catch (error) {
    console.error('Erro ao verificar conferência:', error)
    return false
  }
}

export async function obterJogosPorConferencia(campeonatoId: number) {
  const jogosPorConferencia: { [key: string]: number } = {}

  const jogos = await prisma.jogo.findMany({
    where: { campeonatoId },
    include: {
      timeCasa: true,
      timeVisitante: true
    }
  })

  for (const jogo of jogos) {
    const conferenciaCasa = await obterConferenciaPorTime(jogo.timeCasa.nome)
    
    if (conferenciaCasa) {
      jogosPorConferencia[conferenciaCasa] = (jogosPorConferencia[conferenciaCasa] || 0) + 1
    }
  }

  return jogosPorConferencia
}

async function obterConferenciaPorTime(nomeTime: string): Promise<string | null> {
  for (const [regionalTipo, timesDoRegional] of Object.entries(TIMES_SUPERLIGA)) {
    if (timesDoRegional.includes(nomeTime)) {
      const regional = await prisma.regional.findFirst({
        where: { tipo: regionalTipo },
        include: { conferencia: true }
      })
      
      return regional?.conferencia?.tipo || null
    }
  }
  
  return null
}

export async function validarTemporadaRegular(campeonatoId: number) {
  try {
    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId,
        fase: 'TEMPORADA_REGULAR'
      },
      include: {
        timeCasa: true,
        timeVisitante: true
      }
    })

    const campeonato = await prisma.campeonato.findUnique({
      where: { id: campeonatoId },
      select: { temporada: true }
    })

    const times = await prisma.time.findMany({
      where: {
        temporada: campeonato?.temporada || '2025'
      }
    })

    const jogosPorTime = new Map()
    for (const time of times) {
      jogosPorTime.set(time.id, 0)
    }

    for (const jogo of jogos) {
      jogosPorTime.set(jogo.timeCasaId, (jogosPorTime.get(jogo.timeCasaId) || 0) + 1)
      jogosPorTime.set(jogo.timeVisitanteId, (jogosPorTime.get(jogo.timeVisitanteId) || 0) + 1)
    }

    const jogosValues = Array.from(jogosPorTime.values())
    const minJogos = Math.min(...jogosValues)
    const maxJogos = Math.max(...jogosValues)
    const mediaJogos = jogosValues.reduce((sum, val) => sum + val, 0) / jogosValues.length

    return {
      totalJogos: jogos.length,
      totalTimes: times.length,
      jogosFinalizados: jogos.filter(j => j.status === 'FINALIZADO').length,
      jogosAgendados: jogos.filter(j => j.status === 'AGENDADO').length,
      balanceamento: {
        minJogos,
        maxJogos,
        mediaJogos: Math.round(mediaJogos * 100) / 100,
        diferencaMaxima: maxJogos - minJogos
      },
      jogosPorTime: Object.fromEntries(jogosPorTime),
      validacao: {
        balanceado: (maxJogos - minJogos) <= 1, 
        completo: minJogos >= 3 
      }
    }

  } catch (error) {
    console.error('Erro ao validar temporada regular:', error)
    throw error
  }
}