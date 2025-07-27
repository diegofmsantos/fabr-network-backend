import express, { Request, Response } from 'express'
import { prisma } from '../libs/prisma'
import { gerarFinalNacional } from '../utils/superligaRanking'
import { SUPERLIGA_CONFIG } from '../types'
import { distribuirTimesAutomaticamente, simularResultadosPlayoffs } from '../utils/superligaUtils'
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
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
        },
        timeVisitante: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
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
        dataJogo: jogo.dataJogo,
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

    const jogosPlayoff = await prisma.playoffJogo.count({
      where: { campeonatoId: superliga.id }
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

    let faseAtual = 'CONFIGURACAO'
    if (timesDistribuidos === 0) {
      faseAtual = 'AGUARDANDO DISTRIBUICAO'
    } else if (totalJogos === 0) {
      faseAtual = 'AGUARDANDO AGENDA'
    } else if (jogosFinalizados < totalJogos) {
      faseAtual = 'TEMPORADA REGULAR'
    } else if (jogosPlayoff === 0) {
      faseAtual = 'GERANDO PLAYOFFS'
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
        regionais: 8,
        timesEsperados: 32
      },

      progresso: {
        distribuicaoCompleta: timesDistribuidos >= 32,
        agendaCompleta: totalJogos >= 64,
        temporadaRegularCompleta: jogosFinalizados >= 64,
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
    const { status, fase, rodada, limite } = req.query

    console.log(`🔍 Buscando jogos para temporada ${temporada}:`, {
      status,
      fase,
      rodada,
      limite
    })

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

    const whereClause: any = {
      campeonatoId: superliga.id,
      temporada: temporada
    }

    if (status) whereClause.status = status
    if (fase) whereClause.fase = fase
    if (rodada) whereClause.rodada = parseInt(rodada as string)

    console.log(`🎯 Filtros aplicados:`, whereClause)

    const jogos = await prisma.jogo.findMany({
      where: whereClause,
      include: {
        timeCasa: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            cidade: true,
            logo: true
          }
        },
        timeVisitante: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            cidade: true,
            logo: true
          }
        }
      },
      orderBy: [
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ],
      take: limite ? parseInt(limite as string) : undefined
    })

    console.log(`✅ Encontrados ${jogos.length} jogos`)

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
      conferencia: jogo.conferencia,
      regional: jogo.regional
    }))

    res.json(jogosFormatados)
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
        const timesRegional = times.filter(time => {
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

superligaRouter.get('/rodadas', async (req: Request, res: Response) => {
  try {
    const { temporada, conferencia } = req.query

    if (!temporada) {
      res.status(400).json({ error: 'Temporada é obrigatória' })
      return
    }

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
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
        },
        timeVisitante: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
        }
      },
      orderBy: [
        { conferencia: 'asc' },
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ]
    })

    const rodadasPorConferencia = jogos.reduce((acc: any, jogo) => {
      const conf = jogo.conferencia || 'GERAL'
      if (!acc[conf]) acc[conf] = {}
      if (!acc[conf][jogo.rodada]) acc[conf][jogo.rodada] = []

      acc[conf][jogo.rodada].push({
        id: jogo.id,
        timeCasa: jogo.timeCasa,
        timeVisitante: jogo.timeVisitante,
        dataJogo: jogo.dataJogo,
        status: jogo.status,
        placarCasa: jogo.placarCasa,
        placarVisitante: jogo.placarVisitante,
        local: jogo.local,
        rodada: jogo.rodada
      })

      return acc
    }, {})

    res.json(rodadasPorConferencia)
  } catch (error) {
    console.error('Erro ao buscar rodadas:', error)
    res.status(500).json({
      error: 'Erro ao buscar rodadas',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

function isTimeNoRegional(nomeTime: string, tipoRegional: string): boolean {
  const distribuicaoTimes: { [key: string]: string[] } = {
    'SERRAMAR': ['Vasco Almirantes', 'Flamengo Imperadores', 'Locomotiva FA', 'Tritões FA'],
    'CANASTRA': ['Galo FA', 'Moura Lacerda Dragons', 'Rio Preto Weilers', 'Spartans FA'],
    'CANTAREIRA': ['Corinthians Steamrollers', 'Cruzeiro FA', 'Guarulhos Rhynos', 'Ocelots FA'],
    'ARAUCARIA': ['Timbó Rex', 'Coritiba Crocodiles', 'Calvary Cavaliers', 'Brown Spiders'],
    'PAMPA': ['Santa Maria Soldiers', 'Juventude FA', 'Bravos FA', 'Istepôs FA'],
    'ATLANTICO': ['Fortaleza Tritões', 'Ceará Sabres', 'João Pessoa Espectros', 'Recife Mariners', 'Cavalaria 2 de Julho', 'Caruaru Wolves'],
    'CERRADO': ['Rondonópolis Hawks', 'Cuiabá Arsenal', 'Tubarões do Cerrado'],
    'AMAZONIA': ['Porto Velho Miners', 'Manaus FA', 'São Raimundo Cavaliers']
  }

  return distribuicaoTimes[tipoRegional]?.includes(nomeTime) || false
}

superligaRouter.get('/:temporada/jogos', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const { fase, status, rodada, conferencia, regional, limite } = req.query

    console.log(`🔍 Buscando jogos da temporada ${temporada} com filtros:`, {
      fase, status, rodada, conferencia, regional, limite
    })

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({
        error: `Superliga ${temporada} não encontrada`,
        temporada,
        message: 'Esta temporada ainda não foi criada'
      })
      return
    }

    // Construir filtros dinâmicos
    const whereConditions: any = {
      campeonatoId: superliga.id
    }

    if (fase) {
      whereConditions.fase = fase as string
    }

    if (status) {
      whereConditions.status = status as string
    }

    if (rodada) {
      whereConditions.rodada = parseInt(rodada as string)
    }

    if (conferencia) {
      whereConditions.conferencia = conferencia as string
    }

    if (regional) {
      whereConditions.regional = regional as string
    }

    const jogos = await prisma.jogo.findMany({
      where: whereConditions,
      include: {
        timeCasa: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
        },
        timeVisitante: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            cor: true,
            logo: true
          }
        }
      },
      orderBy: [
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ],
      take: limite ? parseInt(limite as string) : undefined
    })

    console.log(`✅ Encontrados ${jogos.length} jogos`)

    res.json(jogos)
  } catch (error) {
    console.error('Erro ao buscar jogos:', error)
    res.status(500).json({
      error: 'Erro ao buscar jogos',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

superligaRouter.get('/:temporada/jogos', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params
    const {
      status,
      fase,
      rodada,
      conferencia,
      regional,
      timeId,
      limite
    } = req.query

    console.log(`🔍 [SUPERLIGA] Buscando jogos para temporada ${temporada}`)
    console.log(`📊 [SUPERLIGA] Filtros recebidos:`, { status, fase, rodada, conferencia, regional, timeId, limite })

    // ✅ BUSCAR A SUPERLIGA
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: temporada,
        isSuperliga: true
      },
      include: {
        _count: {
          select: {
            jogos: true,
            conferencias: true
          }
        }
      }
    })

    if (!superliga) {
      console.log(`❌ [SUPERLIGA] Superliga ${temporada} não encontrada`)
      res.status(404).json({
        error: `Superliga ${temporada} não encontrada`,
        details: `Verifique se a Superliga foi criada para a temporada ${temporada}`
      })
      return
    }

    console.log(`✅ [SUPERLIGA] Encontrada: ${superliga.nome} (ID: ${superliga.id})`)
    console.log(`📊 [SUPERLIGA] Total de jogos no banco: ${superliga._count.jogos}`)

    // ✅ CONSTRUIR FILTROS DE BUSCA
    const whereClause: any = {
      campeonatoId: superliga.id
    }

    // Aplicar filtros opcionais
    if (status && status !== 'todos') {
      whereClause.status = status
      console.log(`🔍 [SUPERLIGA] Filtro status: ${status}`)
    }

    if (fase && fase !== 'todas') {
      whereClause.fase = fase
      console.log(`🔍 [SUPERLIGA] Filtro fase: ${fase}`)
    }

    if (rodada && !isNaN(parseInt(rodada as string))) {
      whereClause.rodada = parseInt(rodada as string)
      console.log(`🔍 [SUPERLIGA] Filtro rodada: ${rodada}`)
    }

    if (conferencia && conferencia !== 'todas') {
      whereClause.conferencia = conferencia
      console.log(`🔍 [SUPERLIGA] Filtro conferência: ${conferencia}`)
    }

    if (regional && regional !== 'todas') {
      whereClause.regional = regional
      console.log(`🔍 [SUPERLIGA] Filtro regional: ${regional}`)
    }

    if (timeId && !isNaN(parseInt(timeId as string))) {
      const timeIdNum = parseInt(timeId as string)
      whereClause.OR = [
        { timeCasaId: timeIdNum },
        { timeVisitanteId: timeIdNum }
      ]
      console.log(`🔍 [SUPERLIGA] Filtro time: ${timeIdNum}`)
    }

    console.log(`🔍 [SUPERLIGA] Query final:`, JSON.stringify(whereClause, null, 2))

    // ✅ BUSCAR JOGOS COM RELACIONAMENTOS
    const jogos = await prisma.jogo.findMany({
      where: whereClause,
      include: {
        timeCasa: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            logo: true,
            cor: true,
            presidente: true,
            head_coach: true,
            estadio: true
          }
        },
        timeVisitante: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            logo: true,
            cor: true,
            presidente: true,
            head_coach: true,
            estadio: true
          }
        },
        campeonato: {
          select: {
            id: true,
            nome: true,
            temporada: true,
            isSuperliga: true
          }
        },
        // ✅ INCLUIR ESTATÍSTICAS SE NECESSÁRIO
        estatisticas: {
          select: {
            id: true,
            jogadorId: true,
            timeId: true,
            estatisticas: true,
            jogador: {
              select: {
                id: true,
                nome: true,
                posicao: true
              }
            },
            time: {
              select: {
                id: true,
                nome: true,
                sigla: true
              }
            }
          },
          take: 50 // Limitar para performance
        }
      },
      orderBy: [
        { rodada: 'asc' },
        { dataJogo: 'asc' },
        { id: 'asc' }
      ],
      take: limite ? Math.min(parseInt(limite as string), 100) : undefined // Máximo 100 jogos
    })

    console.log(`✅ [SUPERLIGA] Encontrados ${jogos.length} jogos`)
    console.log(`📊 [SUPERLIGA] Primeira amostra:`, jogos.slice(0, 2).map(j => ({
      id: j.id,
      rodada: j.rodada,
      fase: j.fase,
      timeCasa: j.timeCasa.sigla,
      timeVisitante: j.timeVisitante.sigla,
      status: j.status,
      data: j.dataJogo
    })))

    // ✅ RESPOSTA COM LOGS PARA DEBUG
    res.json({
      jogos,
      meta: {
        total: jogos.length,
        superligaId: superliga.id,
        superligaNome: superliga.nome,
        temporada: temporada,
        filtrosAplicados: {
          status: status || 'todos',
          fase: fase || 'todas',
          rodada: rodada || 'todas',
          conferencia: conferencia || 'todas',
          regional: regional || 'todas',
          timeId: timeId || 'todos',
          limite: limite || 'sem limite'
        }
      }
    })

  } catch (error) {
    console.error('❌ [SUPERLIGA] Erro ao buscar jogos:', error)
    res.status(500).json({
      error: 'Erro interno ao buscar jogos da Superliga',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
      temporada: req.params.temporada
    })
  }
})

superligaRouter.get('/:temporada/bracket-playoffjogo', async (req: Request, res: Response) => {
  try {
    const { temporada } = req.params

    const superliga = await buscarSuperligaPorTemporada(temporada)
    if (!superliga) {
      res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
      return
    }

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

    console.log(`🎯 Encontrados ${playoffJogos.length} jogos na tabela PlayoffJogo`)
    res.json(playoffJogos)

  } catch (error) {
    console.error('Erro ao buscar PlayoffJogos:', error)
    res.status(500).json({ error: 'Erro ao buscar PlayoffJogos' })
  }
})

export default superligaRouter