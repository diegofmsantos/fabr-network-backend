import express, { Request, Response } from 'express'
import { prisma } from '../libs/prisma'
import { gerarFinalNacional } from '../utils/superligaRanking'
import { SUPERLIGA_CONFIG } from '../types'
import { distribuirTimesAutomaticamente, gerarPlayoffsCentroNorte, gerarPlayoffsNordeste, gerarPlayoffsSudeste, gerarPlayoffsSul, simularResultadosPlayoffs } from '../utils/superligaUtils'
import { gerarJogosTemporadaRegular } from '../utils/superligaJogosUtils'

const superligaRouter = express.Router()

async function buscarSuperligaPorTemporada(temporada: string) {
  return await prisma.campeonato.findFirst({
    where: {
      temporada,
      isSuperliga: true
    },
    include: {
      conferencias: {
        include: {
          regionais: true
        },
        orderBy: { ordem: 'asc' }
      },
      _count: {
        select: {
          jogos: true,
          conferencias: true
        }
      }
    }
  })
}

superligaRouter.get('/temporadas', async (req: Request, res: Response) => {
  try {
    const temporadas = await prisma.campeonato.findMany({
      where: { isSuperliga: true },
      select: {
        temporada: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        _count: {
          select: {
            jogos: true,
            conferencias: true
          }
        }
      },
      orderBy: { temporada: 'desc' }
    })

    res.json(temporadas)
  } catch (error) {
    console.error('Erro ao buscar temporadas:', error)
    res.status(500).json({
      error: 'Erro ao buscar temporadas',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

superligaRouter.get('/atual', async (req: Request, res: Response) => {
  try {
    const atual = await prisma.campeonato.findFirst({
      where: {
        isSuperliga: true,
        status: { in: ['EM_ANDAMENTO', 'NAO_INICIADO'] }
      },
      orderBy: { temporada: 'desc' }
    })

    if (!atual) {
      res.status(404).json({
        error: 'Nenhuma Superliga ativa encontrada',
        suggestion: 'Crie uma nova Superliga'
      })
    } else {
      res.json(atual)
    }
  } catch (error) {
    console.error('Erro ao buscar temporada atual:', error)
    res.status(500).json({ error: 'Erro ao buscar temporada atual' })
  }
})

superligaRouter.get('/:temporada', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)

    if (!superliga) {
      res.status(404).json({
        error: `Superliga ${temporada} não encontrada`,
        temporada,
        message: 'Esta temporada ainda não foi criada'
      })
    } else {
      res.json(superliga)
    }
  } catch (error) {
    console.error('Erro ao buscar Superliga:', error)
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

superligaRouter.post('/criar', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.body

    if (!temporada) {
      res.status(400).json({ error: 'Temporada é obrigatória' })
    } else {
      const existente = await prisma.campeonato.findFirst({
        where: { temporada, isSuperliga: true }
      })

      if (existente) {
        res.status(400).json({
          error: `Superliga ${temporada} já existe`,
          superliga: existente
        })
      } else {
        const superliga = await prisma.campeonato.create({
          data: {
            nome: `Superliga de Futebol Americano ${temporada}`,
            temporada,
            status: 'NAO_INICIADO',
            dataInicio: new Date(),
            descricao: `Campeonato nacional de futebol americano - temporada ${temporada}`,
            isSuperliga: true
          }
        })

        res.status(201).json({
          message: 'Superliga criada com sucesso!',
          superliga,
          proximoPasso: 'Configure as conferências'
        })
      }
    }
  } catch (error) {
    console.error('Erro ao criar Superliga:', error)
    res.status(500).json({
      error: 'Erro ao criar Superliga',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

superligaRouter.post('/:temporada/configurar-conferencias', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const conferenciaExistente = await prisma.conferencia.findFirst({
        where: { campeonatoId: superliga.id }
      })

      if (conferenciaExistente) {
        res.status(400).json({ error: 'Conferências já foram configuradas' })
      } else {
        const conferencias = []
        let ordemConferencia = 1

        for (const confConfig of SUPERLIGA_CONFIG) {
          const conferencia = await prisma.conferencia.create({
            data: {
              nome: confConfig.nome,
              tipo: confConfig.tipo,
              icone: confConfig.icone,
              campeonatoId: superliga.id,
              ordem: ordemConferencia,
              totalTimes: confConfig.totalTimes
            }
          })

          let ordemRegional = 1
          for (const regConfig of confConfig.regionais) {
            await prisma.regional.create({
              data: {
                nome: regConfig.nome,
                tipo: regConfig.tipo,
                conferenciaId: conferencia.id,
                ordem: ordemRegional,
                timesPorRegional: regConfig.timesPorRegional
              }
            })
            ordemRegional++
          }

          conferencias.push(conferencia)
          ordemConferencia++
        }

        res.status(201).json({
          message: 'Conferências configuradas com sucesso!',
          conferencias: conferencias.length,
          regionais: SUPERLIGA_CONFIG.reduce((acc, conf) => acc + conf.regionais.length, 0),
          proximoPasso: 'Distribua os times nas conferências'
        })
      }
    }
  } catch (error) {
    console.error('Erro ao configurar conferências:', error)
    res.status(500).json({ error: 'Erro ao configurar conferências' })
  }
})

superligaRouter.post('/:temporada/distribuir-times-automatico', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const conferencias = await prisma.conferencia.count({
        where: { campeonatoId: superliga.id }
      })

      if (conferencias === 0) {
        res.status(400).json({
          error: 'Configure as conferências antes de distribuir times'
        })
      } else {
        const timesDistribuidos = await prisma.time.count({
          where: {
            temporada: superliga.temporada,
            // Verificar se times estão associados à superliga
          }
        })

        if (timesDistribuidos === 0) {
          res.status(400).json({ error: 'Nenhum time foi importado para esta temporada' })
        } else {
          const resultado = await distribuirTimesAutomaticamente(superliga.id, temporada)

          res.status(201).json({
            message: 'Times distribuídos automaticamente com sucesso!',
            ...resultado,
            proximoPasso: 'Gere os jogos da temporada regular'
          })
        }
      }
    }
  } catch (error) {
    console.error('Erro ao distribuir times:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao distribuir times'
    })
  }
})

superligaRouter.post('/:temporada/gerar-jogos-temporada', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const { rodadas = 4 } = req.body

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const jogosExistentes = await prisma.jogo.count({
        where: {
          campeonatoId: superliga.id,
          fase: 'TEMPORADA REGULAR'
        }
      })

      if (jogosExistentes > 0) {
        res.status(400).json({ error: 'Jogos da temporada regular já foram gerados' })
      } else {
        const resultado = await gerarJogosTemporadaRegular(superliga.id)

        res.status(201).json({
          message: 'Jogos da temporada regular gerados com sucesso!',
          ...resultado,
          proximoPasso: 'Aguarde o fim da temporada para gerar playoffs'
        })
      }
    }
  } catch (error) {
    console.error('Erro ao gerar jogos:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar jogos da temporada'
    })
  }
})

superligaRouter.get('/:temporada/status', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const totalJogos = await prisma.jogo.count({
        where: { campeonatoId: superliga.id }
      })

      const jogosFinalizados = await prisma.jogo.count({
        where: {
          campeonatoId: superliga.id,
          status: 'FINALIZADO'
        }
      })

      const jogosPlayoff = await prisma.playoffJogo.count({
        where: { campeonatoId: superliga.id }
      })

      const status = {
        fase: totalJogos === 0 ? 'CONFIGURACAO' :
          jogosFinalizados === totalJogos && totalJogos > 0 ? 'PLAYOFFS' : 'TEMPORADA REGULAR',
        totalJogos,
        jogosFinalizados,
        jogosPlayoff,
        temporada
      }

      res.json(status)
    }
  } catch (error) {
    console.error('Erro ao buscar status:', error)
    res.status(500).json({ error: 'Erro ao buscar status da Superliga' })
  }
})

superligaRouter.get('/:temporada/conferencias', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const conferencias = await prisma.conferencia.findMany({
        where: { campeonatoId: superliga.id },
        include: {
          regionais: {
            orderBy: { ordem: 'asc' }
          }
        },
        orderBy: { ordem: 'asc' }
      })

      res.json(conferencias)
    }
  } catch (error) {
    console.error('Erro ao buscar conferências:', error)
    res.status(500).json({ error: 'Erro ao buscar conferências' })
  }
})

superligaRouter.get('/:temporada/times-por-conferencia', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const conferencias = await prisma.conferencia.findMany({
        where: { campeonatoId: superliga.id },
        include: {
          regionais: true
        }
      })

      // Buscar times baseado na estrutura TIMES_SUPERLIGA
      const { TIMES_SUPERLIGA } = require('../types/index')

      const resultado = await Promise.all(
        conferencias.map(async (conf) => {
          const timesConferencia = []

          for (const regional of conf.regionais) {
            const timesRegional = TIMES_SUPERLIGA[regional.tipo as keyof typeof TIMES_SUPERLIGA]

            if (timesRegional) {
              const times = await prisma.time.findMany({
                where: {
                  nome: { in: timesRegional },
                  temporada: temporada
                }
              })
              timesConferencia.push(...times)
            }
          }

          return {
            ...conf,
            times: timesConferencia
          }
        })
      )

      res.json(resultado)
    }
  } catch (error) {
    console.error('Erro ao buscar times:', error)
    res.status(500).json({ error: 'Erro ao buscar times por conferência' })
  }
})

superligaRouter.get('/:temporada/jogos', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const { conferencia, fase, rodada, status, limit } = req.query

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const whereClause: any = {
        campeonatoId: superliga.id
      }

      if (conferencia) whereClause.conferencia = conferencia
      if (fase) whereClause.fase = fase
      if (rodada) whereClause.rodada = parseInt(rodada as string)
      if (status) whereClause.status = status

      const jogos = await prisma.jogo.findMany({
        where: whereClause,
        include: {
          timeCasa: true,
          timeVisitante: true
        },
        orderBy: [
          { rodada: 'asc' },
          { dataJogo: 'asc' }
        ],
        take: limit ? parseInt(limit as string) : undefined
      })

      res.json(jogos)
    }
  } catch (error) {
    console.error('Erro ao buscar jogos:', error)
    res.status(500).json({ error: 'Erro ao buscar jogos' })
  }
})

superligaRouter.get('/:temporada/proximos-jogos', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const { limite = 5 } = req.query

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const jogos = await prisma.jogo.findMany({
        where: {
          campeonatoId: superliga.id,
          status: 'AGENDADO',
          dataJogo: {
            gte: new Date()
          }
        },
        include: {
          timeCasa: true,
          timeVisitante: true
        },
        orderBy: { dataJogo: 'asc' },
        take: parseInt(limite as string)
      })

      res.json(jogos)
    }
  } catch (error) {
    console.error('Erro ao buscar próximos jogos:', error)
    res.status(500).json({ error: 'Erro ao buscar próximos jogos' })
  }
})

superligaRouter.get('/:temporada/ultimos-resultados', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const { limite = 5 } = req.query

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const jogos = await prisma.jogo.findMany({
        where: {
          campeonatoId: superliga.id,
          status: 'FINALIZADO'
        },
        include: {
          timeCasa: true,
          timeVisitante: true
        },
        orderBy: { dataJogo: 'desc' },
        take: parseInt(limite as string)
      })

      res.json(jogos)
    }
  } catch (error) {
    console.error('Erro ao buscar últimos resultados:', error)
    res.status(500).json({ error: 'Erro ao buscar últimos resultados' })
  }
})

superligaRouter.get('/:temporada/jogos/rodada/:rodada', async (req: Request, res: Response) => {
  try {
    const { temporada, rodada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const jogos = await prisma.jogo.findMany({
        where: {
          campeonatoId: superliga.id,
          rodada: parseInt(rodada)
        },
        include: {
          timeCasa: true,
          timeVisitante: true
        },
        orderBy: { dataJogo: 'asc' }
      })

      res.json(jogos)
    }
  } catch (error) {
    console.error('Erro ao buscar jogos da rodada:', error)
    res.status(500).json({ error: 'Erro ao buscar jogos da rodada' })
  }
})

superligaRouter.post('/:temporada/gerar-playoffs', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const resultados = []

      const conferencias = await prisma.conferencia.findMany({
        where: { campeonatoId: superliga.id },
        orderBy: { ordem: 'asc' }
      })

      for (const conferencia of conferencias) {
        let resultado
        switch (conferencia.tipo) {
          case 'SUDESTE':
            resultado = await gerarPlayoffsSudeste(superliga.id, conferencia.id)
            break
          case 'SUL':
            resultado = await gerarPlayoffsSul(superliga.id, conferencia.id)
            break
          case 'NORDESTE':
            resultado = await gerarPlayoffsNordeste(superliga.id, conferencia.id)
            break
          case 'CENTRO NORTE':
            resultado = await gerarPlayoffsCentroNorte(superliga.id, conferencia.id)
            break
        }
        if (resultado) resultados.push(resultado)
      }

      res.status(201).json({
        message: 'Playoffs gerados com sucesso!',
        conferencias: resultados.length,
        proximoPasso: 'Acompanhe os resultados dos playoffs'
      })
    }
  } catch (error) {
    console.error('Erro ao gerar playoffs:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar playoffs'
    })
  }
})

superligaRouter.get('/:temporada/bracket', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const playoffJogos = await prisma.playoffJogo.findMany({
        where: { campeonatoId: superliga.id },
        include: {
          timeClassificado1: true,
          timeClassificado2: true,
          timeVencedor: true,
          conferencia: true
        },
        orderBy: [
          { fase: 'asc' },
          { rodada: 'asc' }
        ]
      })

      res.json(playoffJogos)
    }
  } catch (error) {
    console.error('Erro ao buscar bracket:', error)
    res.status(500).json({ error: 'Erro ao buscar bracket dos playoffs' })
  }
})

superligaRouter.get('/:temporada/fase-nacional', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const faseNacional = await prisma.playoffJogo.findMany({
        where: {
          campeonatoId: superliga.id,
          fase: { in: ['SEMIFINAL NACIONAL', 'FINAL NACIONAL'] }
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

      res.json(faseNacional)
    }
  } catch (error) {
    console.error('Erro ao buscar fase nacional:', error)
    res.status(500).json({ error: 'Erro ao buscar fase nacional' })
  }
})

superligaRouter.post('/:temporada/gerar-fase-nacional', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const resultado = await gerarFinalNacional(superliga.id)

      res.status(201).json({
        message: 'Fase nacional gerada com sucesso!',
        ...resultado
      })
    }
  } catch (error) {
    console.error('Erro ao gerar fase nacional:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar final nacional'
    })
  }
})

superligaRouter.post('/:temporada/simular-playoffs', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      const resultado = await simularResultadosPlayoffs(superliga.id)

      res.json({
        ...resultado
      })
    }
  } catch (error) {
    console.error('Erro ao simular playoffs:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao simular playoffs'
    })
  }
})

superligaRouter.delete('/:temporada', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
    } else {
      await prisma.campeonato.delete({
        where: { id: superliga.id }
      })

      res.json({
        message: `Superliga ${temporada} deletada com sucesso`,
        warning: 'Todos os dados relacionados foram removidos'
      })
    }
  } catch (error) {
    console.error('Erro ao deletar Superliga:', error)
    res.status(500).json({ error: 'Erro ao deletar Superliga' })
  }
})

superligaRouter.get('/:temporada/classificacao', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

    // Buscar conferências com regionais
    const conferencias = await prisma.conferencia.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        regionais: {
          orderBy: { ordem: 'asc' }
        }
      },
      orderBy: { ordem: 'asc' }
    })

    // Buscar todos os jogos da temporada regular finalizados
    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA REGULAR',
        status: 'FINALIZADO'
      },
      include: {
        timeCasa: true,
        timeVisitante: true
      }
    })

    // Buscar todos os times
    const times = await prisma.time.findMany({
      where: { temporada }
    })

    // Calcular estatísticas por time
    const estatisticasTimes = new Map()
    
    times.forEach(time => {
      estatisticasTimes.set(time.id, {
        timeId: time.id,
        time: time,
        jogos: 0,
        vitorias: 0,
        derrotas: 0,
        pontosPro: 0,
        pontosContra: 0,
        saldo: 0,
        aproveitamento: 0
      })
    })

    // Processar jogos
    jogos.forEach(jogo => {
      const statsCasa = estatisticasTimes.get(jogo.timeCasaId)
      const statsVisitante = estatisticasTimes.get(jogo.timeVisitanteId)

      if (statsCasa && statsVisitante) {
        statsCasa.jogos++
        statsVisitante.jogos++
        
        statsCasa.pontosPro += jogo.placarCasa || 0
        statsCasa.pontosContra += jogo.placarVisitante || 0
        
        statsVisitante.pontosPro += jogo.placarVisitante || 0
        statsVisitante.pontosContra += jogo.placarCasa || 0

        if ((jogo.placarCasa || 0) > (jogo.placarVisitante || 0)) {
          statsCasa.vitorias++
          statsVisitante.derrotas++
        } else {
          statsVisitante.vitorias++
          statsCasa.derrotas++
        }
      }
    })

    // Calcular saldo e aproveitamento
    estatisticasTimes.forEach(stats => {
      stats.saldo = stats.pontosPro - stats.pontosContra
      stats.aproveitamento = stats.jogos > 0 ? (stats.vitorias / stats.jogos) * 100 : 0
    })

    // Organizar por conferência e regional - CORRIGIDO O TIPO
    const classificacaoPorConferencia: any = {}

    for (const conferencia of conferencias) {
      const regionaisClassificacao = []

      for (const regional of conferencia.regionais) {
        // Buscar times deste regional (isso precisa ser implementado na tabela de distribuição)
        // Por ora, vamos usar uma lógica temporária baseada no nome
        const timesRegional = times.filter(time => {
          // LÓGICA TEMPORÁRIA - deve ser substituída por tabela de distribuição
          return isTimeNoRegional(time.nome, regional.tipo)
        })

        const timesComStats = timesRegional
          .map(time => estatisticasTimes.get(time.id))
          .filter(Boolean)
          .sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
          })
          .map((stats, index) => ({
            posicao: index + 1,
            ...stats
          }))

        regionaisClassificacao.push({
          regionalId: regional.id,
          regional: regional.tipo,
          nome: regional.nome,
          times: timesComStats
        })
      }

      classificacaoPorConferencia[conferencia.tipo] = {
        nome: conferencia.nome,
        tipo: conferencia.tipo,
        regionais: regionaisClassificacao
      }
    }

    res.json(classificacaoPorConferencia)
  } catch (error) {
    console.error('Erro ao buscar classificação:', error)
    res.status(500).json({ error: 'Erro ao buscar classificação' })
  }
})

// ==================== FUNÇÃO AUXILIAR - CORRIGIDA ====================

function isTimeNoRegional(nomeTime: string, tipoRegional: string): boolean {
  // LÓGICA TEMPORÁRIA - deve ser substituída por tabela de distribuição
  const distribuicaoTimes: { [key: string]: string[] } = {
    'SERRAMAR': ['Vasco Almirantes', 'Flamengo Imperadores', 'Locomotiva FA', 'Tritões FA'],
    'CANASTRA': ['Galo FA', 'Moura Lacerda Dragons', 'Rio Preto Weilers', 'Spartans FA'],
    'CANTAREIRA': ['Corinthians Steamrollers', 'Cruzeiro FA', 'Guarulhos Rhynos', 'Ocelots FA'],
    'ARAUCARIA': ['Timbó Rex', 'Coritiba Crocodiles', 'Calvary Cavaliers', 'Brown Spiders'],
    'PAMPA': ['Santa Maria Soldiers', 'Juventude FA', 'Bravos FA', 'Istepôs FA'],
    'ATLANTICO': ['Fortaleza Tritões', 'Ceará Sabres', 'João Pessoa Espectros', 'Recife Mariners', 'Cavalaria 2 de Julho', 'Caruaru Wolves'],
    'CERRADO': ['Rondonópolis Hawks', 'Cuiabá Arsenal', 'Tubarões do Cerrado'],
    'AMAZONIA': ['Porto Velho Miners', 'Manaus FA', 'Manaus Cavaliers']
  }

  return distribuicaoTimes[tipoRegional]?.includes(nomeTime) || false
}

export default superligaRouter