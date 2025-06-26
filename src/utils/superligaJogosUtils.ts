import { prisma } from "../libs/prisma"


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

    // Verificar se já existem jogos
    const jogosExistentes = await prisma.jogo.count({
      where: {
        campeonatoId,
        fase: 'TEMPORADA_REGULAR'
      }
    })

    if (jogosExistentes > 0) {
      throw new Error('Jogos da temporada regular já foram gerados')
    }

    // Buscar grupos com times
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
      // 1. JOGOS DENTRO DOS REGIONAIS (60% dos jogos)
      for (const grupo of grupos) {
        const times = grupo.times.map(gt => gt.time)
        
        if (times.length < 2) continue

        // Gerar confrontos round-robin dentro do regional
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
          
          // Avançar data (espaçamento entre jogos)
          if (contadorJogo % 4 === 0) { // A cada 4 jogos, avança 1 semana
            dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
          }
          contadorJogo++
        }
      }

      // 2. JOGOS INTERREGIONAIS (40% dos jogos) - Se habilitado
      if (jogosInterregionais) {
        const jogosInterregionais = await gerarJogosInterregionais(
          campeonatoId, 
          grupos, 
          Math.floor(rodadas * 0.4),
          dataAtual,
          intervaloDias
        )
        jogosGerados.push(...jogosInterregionais)
      }

    } else if (algoritmo === 'BALANCED') {
      // Algoritmo balanceado: garantir 4 jogos exatos por time
      const jogosBalanceados = await gerarJogosBalanceados(
        campeonatoId,
        grupos,
        rodadas,
        dataInicio,
        intervaloDias
      )
      jogosGerados.push(...jogosBalanceados)
    }

    // Atualizar status do campeonato
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

// FUNÇÃO AUXILIAR: Round Robin dentro do regional
function gerarRoundRobin(times: any[], totalRodadas: number) {
  const confrontos = []
  let rodadaAtual = 1

  for (let rodada = 1; rodada <= totalRodadas; rodada++) {
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        // Alternar mando de campo a cada rodada
        const timeCasa = (rodada % 2 === 1) ? times[i] : times[j]
        const timeVisitante = (rodada % 2 === 1) ? times[j] : times[i]

        confrontos.push({
          timeCasa,
          timeVisitante,
          rodada: rodadaAtual
        })

        if (confrontos.filter(c => c.rodada === rodadaAtual).length >= Math.floor(times.length / 2)) {
          rodadaAtual++
        }
      }
    }
  }

  return confrontos.slice(0, totalRodadas * Math.floor(times.length / 2))
}

// FUNÇÃO AUXILIAR: Jogos entre regionais diferentes
async function gerarJogosInterregionais(
  campeonatoId: number, 
  grupos: any[], 
  totalJogos: number,
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosInterregionais = []
  const gruposPorConferencia = agruparPorConferencia(grupos)
  
  let dataAtual = new Date(dataInicio)
  let contadorJogo = 0

  // Gerar confrontos entre regionais da mesma conferência
  for (const [conferencia, gruposConf] of Object.entries(gruposPorConferencia)) {
    if (gruposConf.length < 2) continue

    for (let i = 0; i < gruposConf.length; i++) {
      for (let j = i + 1; j < gruposConf.length; j++) {
        const grupoA = gruposConf[i]
        const grupoB = gruposConf[j]
        
        // Pegar os melhores times de cada regional (simulação)
        const timesA = grupoA.times.slice(0, 2) // Top 2 do regional A
        const timesB = grupoB.times.slice(0, 2) // Top 2 do regional B

        // Gerar confrontos cruzados
        for (let a = 0; a < timesA.length && contadorJogo < totalJogos; a++) {
          for (let b = 0; b < timesB.length && contadorJogo < totalJogos; b++) {
            const jogo = await prisma.jogo.create({
              data: {
                campeonatoId,
                grupoId: null, // Jogo interregional
                timeCasaId: timesA[a].time.id,
                timeVisitanteId: timesB[b].time.id,
                dataJogo: new Date(dataAtual),
                rodada: Math.ceil(contadorJogo / 8) + 5, // Rodadas finais
                fase: 'TEMPORADA_REGULAR',
                status: 'AGENDADO',
                local: timesA[a].time.estadio,
                observacoes: `Interregional: ${grupoA.regional?.nome} × ${grupoB.regional?.nome}`
              }
            })

            jogosInterregionais.push(jogo)
            contadorJogo++

            // Avançar data
            if (contadorJogo % 6 === 0) {
              dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
            }
          }
        }
      }
    }
  }

  return jogosInterregionais
}

// FUNÇÃO AUXILIAR: Algoritmo balanceado (exatamente 4 jogos por time)
async function gerarJogosBalanceados(
  campeonatoId: number,
  grupos: any[],
  jogosPerTime: number,
  dataInicio: Date,
  intervaloDias: number
) {
  const jogosBalanceados = []
  const contadorJogosPorTime = new Map()
  
  // Inicializar contador para cada time
  for (const grupo of grupos) {
    for (const grupoTime of grupo.times) {
      contadorJogosPorTime.set(grupoTime.time.id, 0)
    }
  }

  let dataAtual = new Date(dataInicio)
  let rodadaAtual = 1

  while (true) {
    let jogosNaRodada = 0
    
    // Tentar gerar jogos para times que ainda precisam
    for (const grupo of grupos) {
      const times = grupo.times.map(gt => gt.time)
      
      for (let i = 0; i < times.length; i++) {
        for (let j = i + 1; j < times.length; j++) {
          const timeA = times[i]
          const timeB = times[j]
          
          const jogosA = contadorJogosPorTime.get(timeA.id) || 0
          const jogosB = contadorJogosPorTime.get(timeB.id) || 0
          
          // Se ambos os times ainda precisam de jogos
          if (jogosA < jogosPerTime && jogosB < jogosPerTime) {
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
                local: timeA.estadio,
                observacoes: `Rodada ${rodadaAtual} - ${grupo.regional?.nome || grupo.nome}`
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

    // Se não gerou nenhum jogo nesta rodada, parar
    if (jogosNaRodada === 0) break

    // Avançar para próxima rodada
    rodadaAtual++
    dataAtual = new Date(dataAtual.getTime() + intervaloDias * 24 * 60 * 60 * 1000)
  }

  return jogosBalanceados
}

// FUNÇÕES AUXILIARES
function agruparPorConferencia(grupos: any[]) {
  return grupos.reduce((acc, grupo) => {
    const conferencia = grupo.regional?.conferencia?.tipo || 'INDEFINIDA'
    if (!acc[conferencia]) acc[conferencia] = []
    acc[conferencia].push(grupo)
    return acc
  }, {})
}

function contarJogosPorRodada(jogos: any[]) {
  return jogos.reduce((acc, jogo) => {
    acc[jogo.rodada] = (acc[jogo.rodada] || 0) + 1
    return acc
  }, {})
}

function contarJogosPorConferencia(jogos: any[], grupos: any[]) {
  const mapeamentoGrupoConferencia = grupos.reduce((acc, grupo) => {
    acc[grupo.id] = grupo.regional?.conferencia?.tipo || 'INDEFINIDA'
    return acc
  }, {})

  return jogos.reduce((acc, jogo) => {
    const conferencia = mapeamentoGrupoConferencia[jogo.grupoId] || 'INTERREGIONAL'
    acc[conferencia] = (acc[conferencia] || 0) + 1
    return acc
  }, {})
}