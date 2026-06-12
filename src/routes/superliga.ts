import express, { Request, Response } from 'express'
import { prisma } from '../libs/prisma'
import { distribuirTimesAutomaticamente } from '../utils/superligaUtils'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA, getRegionalDoTime } from '../config/superligaConfig'

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

superligaRouter.get('/rodadas', async (req: Request, res: Response) => {
  try {
    const { temporada, conferencia } = req.query

    if (!temporada) {
      res.status(400).json({ error: 'Temporada é obrigatória' })
      return
    }

    console.log(`🎯 Buscando rodadas para temporada: ${temporada}, conferencia: ${conferencia || 'todas'}`)

    const whereClause: any = {
      temporada: temporada as string,
      fase: 'TEMPORADA REGULAR'
    }

    if (conferencia) {
      whereClause.conferencia = conferencia as string
    }

    const jogos = await prisma.jogo.findMany({
      where: whereClause,
      include: {
        timeCasa: {
          select: { id: true, nome: true, sigla: true, cor: true, logo: true }
        },
        timeVisitante: {
          select: { id: true, nome: true, sigla: true, cor: true, logo: true }
        }
      },
      orderBy: [
        { conferencia: 'asc' },
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ]
    })

    console.log(`📊 Encontrados ${jogos.length} jogos`)

    const rodadasPorConferencia = jogos.reduce((acc: any, jogo) => {
      const conf = jogo.conferencia || 'GERAL'
      if (!acc[conf]) acc[conf] = {}
      if (!acc[conf][jogo.rodada]) acc[conf][jogo.rodada] = []

      acc[conf][jogo.rodada].push({
        id: jogo.id,
        timeCasa: jogo.timeCasa,
        timeVisitante: jogo.timeVisitante,
        dataJogo: jogo.dataJogo ? new Date(jogo.dataJogo).toISOString() : null,
        status: jogo.status,
        placarCasa: jogo.placarCasa,
        placarVisitante: jogo.placarVisitante,
        local: jogo.local,
        rodada: jogo.rodada
      })

      return acc
    }, {})

    console.log(`✅ Agrupados em ${Object.keys(rodadasPorConferencia).length} conferências`)

    res.json(rodadasPorConferencia)
  } catch (error) {
    console.error('❌ Erro ao buscar rodadas:', error)
    res.status(500).json({
      error: 'Erro ao buscar rodadas',
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
          }
        })

        if (timesDistribuidos === 0) {
          res.status(400).json({ error: 'Nenhum time foi importado para esta temporada' })
        } else {
          const resultado = await distribuirTimesAutomaticamente(superliga.id, temporada)

          res.status(201).json({
            message: 'Times distribuídos automaticamente com sucesso!',
            ...resultado,
            proximoPasso: 'Importe a agenda de jogos'
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

superligaRouter.get('/:temporada/status', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

    const totalJogos = await prisma.jogo.count({
      where: { campeonatoId: superliga.id }
    })

    const jogosFinalizados = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        status: 'FINALIZADO'
      }
    })

    const jogosPlayoff = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: {
          not: 'TEMPORADA REGULAR'
        }
      }
    })

    const timesDistribuidos = await prisma.distribuicaoTime.count({
      where: {
        campeonatoId: superliga.id,
        temporada: temporada
      }
    })

    const proximosJogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        status: 'AGENDADO',
        dataJogo: {
          gte: new Date()
        }
      },
      include: {
        timeCasa: { select: { nome: true, sigla: true } },
        timeVisitante: { select: { nome: true, sigla: true } }
      },
      orderBy: { dataJogo: 'asc' },
      take: 3
    })

    // Em 2026 os jogos (regular e playoffs) vêm por importação — não há fase de "geração".
    let faseAtual = 'CONFIGURACAO'
    if (timesDistribuidos === 0) {
      faseAtual = 'AGUARDANDO DISTRIBUICAO'
    } else if (totalJogos === 0) {
      faseAtual = 'AGUARDANDO AGENDA'
    } else if (jogosFinalizados < totalJogos) {
      faseAtual = 'TEMPORADA REGULAR'
    } else {
      faseAtual = 'PLAYOFFS'
    }

    const status = {
      superliga: {
        id: superliga.id,
        nome: superliga.nome,
        temporada: superliga.temporada,
        status: superliga.status
      },
      fase: faseAtual,

      timesDistribuidos,
      totalJogos,
      jogosFinalizados,
      jogosAgendados: totalJogos - jogosFinalizados,
      jogosPlayoff,

      proximosJogos: proximosJogos.map(jogo => ({
        id: jogo.id,
        timeCasa: jogo.timeCasa,
        timeVisitante: jogo.timeVisitante,
        dataJogo: jogo.dataJogo,
        local: jogo.local,
        rodada: jogo.rodada
      })),

      estrutura: {
        conferencias: 4,
        regionais: 6,
        timesEsperados: 29
      },

      progresso: {
        distribuicaoCompleta: timesDistribuidos >= 29,
        agendaCompleta: totalJogos > 0,
        temporadaRegularCompleta: totalJogos > 0 && jogosFinalizados >= totalJogos,
        playoffsGerados: jogosPlayoff > 0
      }
    }

    res.json(status)
  } catch (error) {
    console.error('❌ Erro ao buscar status:', error)
    res.status(500).json({
      error: 'Erro ao buscar status da Superliga',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
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
    const {
      conferencia,
      fase,
      rodada,
      status,
      limite
    } = req.query

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

    const where: any = {
      campeonatoId: superliga.id
    }

    if (conferencia && typeof conferencia === 'string') {
      const conf = await prisma.conferencia.findFirst({
        where: {
          campeonatoId: superliga.id,
          tipo: conferencia.toUpperCase()
        }
      })
      if (conf) {
        where.conferenciaId = conf.id
      }
    }

    if (fase && typeof fase === 'string') {
      const fases = fase.split(',').map(f => f.trim())
      where.fase = fases.length === 1 ? fases[0] : { in: fases }
    }

    if (rodada) {
      where.rodada = parseInt(rodada as string)
    }

    if (status && typeof status === 'string') {
      where.status = status
    }

    const jogos = await prisma.jogo.findMany({
      where,
      include: {
        timeCasa: {
          select: { id: true, nome: true, sigla: true, cor: true, cidade: true, logo: true }
        },
        timeVisitante: {
          select: { id: true, nome: true, sigla: true, cor: true, cidade: true, logo: true }
        },
        conferenciaRelacao: {
          select: { id: true, nome: true, tipo: true }
        },
        regionalRelacao: {
          select: { id: true, nome: true, tipo: true }
        }
      },
      orderBy: [
        { fase: 'asc' },
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ],
      take: limite ? parseInt(limite as string) : undefined
    })

    console.log(`🎯 Encontrados ${jogos.length} jogos para temporada ${temporada}`)

    const jogosFormatados = jogos.map(jogo => ({
      id: jogo.id,
      timeCasa: jogo.timeCasa,
      timeVisitante: jogo.timeVisitante,
      dataJogo: jogo.dataJogo,
      local: jogo.local,
      rodada: jogo.rodada,
      fase: jogo.fase,
      status: jogo.status,
      placarCasa: jogo.placarCasa,
      placarVisitante: jogo.placarVisitante,
      observacoes: jogo.observacoes,
      nome: jogo.nome,
      timeVencedorId: jogo.timeVencedorId,
      conferencia: jogo.conferencia,
      regional: jogo.regional
    }))

    if (fase && typeof fase === 'string' && fase.includes('WILD CARD,SEMIFINAL')) {
      res.json(jogosFormatados)
    } else {
      res.json({
        jogos: jogosFormatados,
        total: jogosFormatados.length,
        temporada,
        filtros: {
          conferencia,
          fase,
          rodada,
          status
        }
      })
    }

  } catch (error) {
    console.error('❌ Erro ao buscar jogos:', error)
    res.status(500).json({
      error: 'Erro ao buscar jogos',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
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

superligaRouter.get('/:temporada/bracket', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

    const playoffJogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: {
          in: ['WILD CARD', 'SEMIFINAL DE CONFERÊNCIA', 'FINAL DE CONFERÊNCIA', 'SEMIFINAL NACIONAL', 'FINAL NACIONAL']
        }
      },
      include: {
        timeCasa: {
          select: { id: true, nome: true, sigla: true, cor: true, cidade: true, logo: true }
        },
        timeVisitante: {
          select: { id: true, nome: true, sigla: true, cor: true, cidade: true, logo: true }
        },
        conferenciaRelacao: {
          select: { id: true, nome: true, tipo: true }
        }
      },
      orderBy: [
        { fase: 'asc' },
        { rodada: 'asc' }
      ]
    })

    console.log(`🎯 Retornando ${playoffJogos.length} jogos de playoff para o frontend`)

    const jogosFormatados = playoffJogos.map(jogo => {
      let timeVencedor = null
      if (jogo.timeVencedorId) {
        timeVencedor = jogo.timeVencedorId === jogo.timeCasa?.id ? jogo.timeCasa : jogo.timeVisitante
      }

      return {
        id: jogo.id,
        timeClassificado1: jogo.timeCasa,
        timeClassificado2: jogo.timeVisitante,
        placarTime1: jogo.placarCasa,
        placarTime2: jogo.placarVisitante,
        timeVencedorId: jogo.timeVencedorId,
        timeVencedor: timeVencedor,
        dataJogo: jogo.dataJogo,
        local: jogo.local,
        rodada: jogo.rodada,
        fase: jogo.fase,
        status: jogo.status,
        nome: jogo.nome,
        observacoes: jogo.observacoes,
        conferencia: jogo.conferenciaRelacao
      }
    })

    res.json(jogosFormatados)

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
      const faseNacional = await prisma.jogo.findMany({
        where: {
          campeonatoId: superliga.id,
          fase: { in: ['SEMIFINAL NACIONAL', 'FINAL NACIONAL'] }
        },
        include: {
          timeCasa: true,
          timeVisitante: true
        },
        orderBy: { fase: 'asc' }
      })

      res.json(faseNacional)
    }
  } catch (error) {
    console.error('Erro ao buscar fase nacional:', error)
    res.status(500).json({ error: 'Erro ao buscar fase nacional' })
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

    const conferencias = await prisma.conferencia.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        regionais: {
          orderBy: { ordem: 'asc' }
        }
      },
      orderBy: { ordem: 'asc' }
    })

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

    const times = await prisma.time.findMany({
      where: { temporada }
    })

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

    estatisticasTimes.forEach(stats => {
      stats.saldo = stats.pontosPro - stats.pontosContra
      stats.aproveitamento = stats.jogos > 0 ? (stats.vitorias / stats.jogos) * 100 : 0
    })

    const classificacaoPorConferencia: any = {}

    for (const conferencia of conferencias) {
      const regionaisClassificacao = []

      for (const regional of conferencia.regionais) {
        const timesRegional = times.filter(time => getRegionalDoTime(time.nome) === regional.tipo)

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

export default superligaRouter