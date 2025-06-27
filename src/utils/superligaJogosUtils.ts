import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface ConfiguracaoJogos {
  campeonatoId: number
  rodadas: number
  algoritmo: 'ROUND_ROBIN' | 'BALANCED'
  dataInicio: Date
  intervaloDias: number
  jogosInterregionais: boolean
}

export async function gerarJogosTemporadaRegular(config: ConfiguracaoJogos) {
  try {
    const { campeonatoId, rodadas, algoritmo, dataInicio, intervaloDias, jogosInterregionais } = config

    const jogosExistentes = await prisma.jogo.count({
      where: {
        campeonatoId,
        fase: 'TEMPORADA_REGULAR'
      }
    })

    if (jogosExistentes > 0) {
      throw new Error('Jogos da temporada regular já foram gerados')
    }

    const grupos = await prisma.grupo.findMany({
      where: { campeonatoId },
      include: {
        times: {
          include: { time: true }
        },
        regional: {
          include: { conferencia: true }
        }
      }
    })

    if (grupos.length === 0) {
      throw new Error('Distribua os times antes de gerar jogos')
    }

    const jogosGerados = []
    let dataAtual = new Date(dataInicio)
    let contadorJogo = 0

    if (algoritmo === 'ROUND_ROBIN') {
      for (const grupo of grupos) {
        const times = grupo.times.map(gt => gt.time)
        
        if (times.length < 2) continue

        const confrontosRegional = gerarRoundRobin(times, Math.ceil(rodadas * 0.6))
        
        for (const confronto of confrontosRegional) {
          const jogo = await prisma.jogo.create({
            data: {
              campeonatoId,
              grupoId: grupo.id,
              timeCasaId: confronto.timeCasa.id,
              timeVisitanteId: confronto.timeVisitante.id,
              dataJogo: new Date(dataAtual),
              rodada: confronto.rodada,
              fase: 'TEMPORADA_REGULAR',
              status: 'AGENDADO',
              local: confronto.timeCasa.estadio || `Estádio ${confronto.timeCasa.cidade}`,
              observacoes: `${grupo.regional?.nome || grupo.nome} - Rodada ${confronto.rodada}`
            }
          })
          
          jogosGerados.push(jogo)
          
          if (contadorJogo % 4 === 0) { 
            dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
          }
          contadorJogo++
        }
      }

      if (jogosInterregionais) {
        const jogosInterregionaisGerados = await gerarJogosInterregionais(
          campeonatoId, 
          grupos, 
          Math.floor(rodadas * 0.4),
          dataAtual,
          intervaloDias
        )
        jogosGerados.push(...jogosInterregionaisGerados)
      }

    } else if (algoritmo === 'BALANCED') {
      const jogosBalanceados = await gerarJogosBalanceados(
        campeonatoId,
        grupos,
        rodadas,
        dataInicio,
        intervaloDias
      )
      jogosGerados.push(...jogosBalanceados)
    }

    await prisma.campeonato.update({
      where: { id: campeonatoId },
      data: { 
        status: 'EM_ANDAMENTO',
        dataInicio: dataInicio
      }
    })

    return {
      totalJogos: jogosGerados.length,
      jogosPorRodada: contarJogosPorRodada(jogosGerados),
      jogosPorConferencia: contarJogosPorConferencia(jogosGerados, grupos),
      primeirRodada: dataInicio,
      ultimaRodada: dataAtual,
      observacoes: `Temporada regular gerada com algoritmo ${algoritmo}`
    }

  } catch (error) {
    console.error('Erro ao gerar jogos da temporada regular:', error)
    throw error
  }
}

function gerarRoundRobin(times: any[], totalRodadas: number) {
  const confrontos = []
  let rodadaAtual = 1

  for (let rodada = 1; rodada <= totalRodadas; rodada++) {
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        const timeCasa = (rodada % 2 === 1) ? times[i] : times[j]
        const timeVisitante = (rodada % 2 === 1) ? times[j] : times[i]

        confrontos.push({
          timeCasa,
          timeVisitante,
          rodada: rodadaAtual
        })
      }
    }
    rodadaAtual++
  }

  return confrontos
}

async function gerarJogosInterregionais(
  campeonatoId: number,
  grupos: any[],
  rodadasInterregionais: number,
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosInterregionais = []
  let contadorJogo = 0
  let dataAtual = new Date(dataInicio)

  const gruposPorConferencia = grupos.reduce((acc, grupo) => {
    const conferencia = grupo.regional?.conferencia?.tipo || 'UNKNOWN'
    if (!acc[conferencia]) acc[conferencia] = []
    acc[conferencia].push(grupo)
    return acc
  }, {} as Record<string, any[]>)

  const conferencias = Object.keys(gruposPorConferencia)
  
  for (let rodada = 1; rodada <= rodadasInterregionais; rodada++) {
    for (let confA = 0; confA < conferencias.length; confA++) {
      for (let confB = confA + 1; confB < conferencias.length; confB++) {
        const gruposA = gruposPorConferencia[conferencias[confA]]
        const gruposB = gruposPorConferencia[conferencias[confB]]

        for (const grupoA of gruposA) {
          for (const grupoB of gruposB) {
            const timesA = grupoA.times.map((gt: any) => gt.time)
            const timesB = grupoB.times.map((gt: any) => gt.time)

            const maxConfrontos = Math.min(2, timesA.length, timesB.length)
            
            for (let confronto = 0; confronto < maxConfrontos; confronto++) {
              const timeA = timesA[confronto % timesA.length]
              const timeB = timesB[confronto % timesB.length]

              const jogo = await prisma.jogo.create({
                data: {
                  campeonatoId,
                  grupoId: grupoA.id,
                  timeCasaId: timeA.id,
                  timeVisitanteId: timeB.id,
                  dataJogo: new Date(dataAtual),
                  rodada: Math.floor(contadorJogo / 8) + 5, 
                  fase: 'TEMPORADA_REGULAR',
                  status: 'AGENDADO',
                  local: timeA.estadio || `Estádio ${timeA.cidade}`,
                  observacoes: `Interregional: ${grupoA.regional?.nome} × ${grupoB.regional?.nome}`
                }
              })

              jogosInterregionais.push(jogo)
              contadorJogo++

              if (contadorJogo % 6 === 0) {
                dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
              }
            }
          }
        }
      }
    }
  }

  return jogosInterregionais
}

async function gerarJogosBalanceados(
  campeonatoId: number,
  grupos: any[],
  jogosPerTime: number,
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosBalanceados = []
  const contadorJogosPorTime = new Map()
  
  for (const grupo of grupos) {
    for (const grupoTime of grupo.times) {
      contadorJogosPorTime.set(grupoTime.time.id, 0)
    }
  }

  let dataAtual = new Date(dataInicio)
  let rodadaAtual = 1
  let tentativas = 0
  const maxTentativas = jogosPerTime * 50 

  while (tentativas < maxTentativas) {
    let jogosNaRodada = 0
    
    for (const grupo of grupos) {
      const times = grupo.times.map((gt: any) => gt.time)
      
      for (let i = 0; i < times.length; i++) {
        for (let j = i + 1; j < times.length; j++) {
          const timeA = times[i]
          const timeB = times[j]
          
          const jogosA = contadorJogosPorTime.get(timeA.id) || 0
          const jogosB = contadorJogosPorTime.get(timeB.id) || 0
          
          if (jogosA < jogosPerTime && jogosB < jogosPerTime) {
            const jaSeEnfrentaram = await prisma.jogo.findFirst({
              where: {
                campeonatoId,
                OR: [
                  { timeCasaId: timeA.id, timeVisitanteId: timeB.id },
                  { timeCasaId: timeB.id, timeVisitanteId: timeA.id }
                ]
              }
            })

            if (!jaSeEnfrentaram) {
              const jogo = await prisma.jogo.create({
                data: {
                  campeonatoId,
                  grupoId: grupo.id,
                  timeCasaId: timeA.id,
                  timeVisitanteId: timeB.id,
                  dataJogo: new Date(dataAtual),
                  rodada: rodadaAtual,
                  fase: 'TEMPORADA_REGULAR',
                  status: 'AGENDADO',
                  local: timeA.estadio || `Estádio ${timeA.cidade}`,
                  observacoes: `${grupo.regional?.nome || grupo.nome} - Balanceado`
                }
              })

              jogosBalanceados.push(jogo)
              
              contadorJogosPorTime.set(timeA.id, jogosA + 1)
              contadorJogosPorTime.set(timeB.id, jogosB + 1)
              
              jogosNaRodada++
            }
          }
        }
      }
    }

    if (jogosNaRodada === 0) {
      break
    }

    rodadaAtual++
    dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
    tentativas++
  }

  const timesComPoucosJogos = []
  for (const [timeId, jogos] of contadorJogosPorTime.entries()) {
    if (jogos < jogosPerTime - 1) {
      timesComPoucosJogos.push({ timeId, jogos })
    }
  }

  if (timesComPoucosJogos.length > 0) {
    console.warn('Times com poucos jogos:', timesComPoucosJogos)
  }

  return jogosBalanceados
}

function contarJogosPorRodada(jogos: any[]) {
  const contadorRodadas = jogos.reduce((acc, jogo) => {
    const rodada = jogo.rodada || 1
    acc[rodada] = (acc[rodada] || 0) + 1
    return acc
  }, {} as Record<number, number>)

  return contadorRodadas
}

function contarJogosPorConferencia(jogos: any[], grupos: any[]) {
  const jogosPorConferencia = {} as Record<string, number>

  for (const jogo of jogos) {
    const grupo = grupos.find(g => g.id === jogo.grupoId)
    if (grupo?.regional?.conferencia?.tipo) {
      const conferencia = grupo.regional.conferencia.tipo
      jogosPorConferencia[conferencia] = (jogosPorConferencia[conferencia] || 0) + 1
    }
  }

  return jogosPorConferencia
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

    const times = await prisma.time.findMany({
      where: {
        jogadores: {
          some: {
            temporada: '2025' 
          }
        }
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