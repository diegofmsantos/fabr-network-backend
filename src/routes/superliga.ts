import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { gerarPlayoffsSudeste,  gerarPlayoffsSul,  gerarPlayoffsNordeste,  gerarPlayoffsCentroNorte, distribuirTimesAutomaticamente } from '../utils/superligaUtils'
import { TipoConferencia, TipoRegional } from '../types'
import { gerarSemifinaisNacionais, gerarFinalNacional, getFaseNacional } from '../utils/superligaRanking'
import { calcularRankingGeral, getWildCardRanking } from '../utils/superligaRanking'
import { repararIntegridadeSuperliga, validarIntegridadeSuperliga } from '../utils/superligaValidacao'


const prisma = new PrismaClient()
const superligaRouter = express.Router()

const validarId = (id: string) => {
    const numId = parseInt(id)
    if (isNaN(numId) || numId <= 0) {
        throw new Error('ID inválido')
    }
    return numId
}

superligaRouter.post('/criar', async (req: Request, res: Response) => {
    try {
        const { temporada, nome, dataInicio, descricao } = req.body

        const superligaExistente = await prisma.campeonato.findFirst({
            where: {
                temporada,
                isSuperliga: true
            }
        })

        if (superligaExistente) {
            res.status(400).json({
                error: `Já existe uma Superliga para a temporada ${temporada}`
            })
            return
        }

        const campeonato = await prisma.campeonato.create({
            data: {
                nome: nome || `Superliga de Futebol Americano ${temporada}`,
                temporada,
                status: 'NAO_INICIADO',
                dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                descricao,
                isSuperliga: true,
                configSuperliga: {
                    conferencias: 4,
                    regionais: 8,
                    times: 32,
                    formatoPlayoffs: 'CONFERENCIA_NACIONAL'
                }
            }
        })

        res.status(201).json({
            message: 'Superliga criada com sucesso!',
            campeonato,
            proximoPasso: 'Distribuir times nas conferências'
        })
    } catch (error) {
        console.error('Erro ao criar Superliga:', error)
        res.status(500).json({ error: 'Erro ao criar Superliga' })
    }
})

superligaRouter.post('/campeonatos/:id/distribuir-times-superliga', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)
        const { distribuicao } = req.body

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        if (!campeonato.isSuperliga) {
            res.status(400).json({ error: 'Este campeonato não é uma Superliga' })
            return
        }

        const times = await prisma.time.findMany({
            where: { temporada: campeonato.temporada }
        })

        if (times.length !== 32) {
            res.status(400).json({
                error: `Superliga precisa de exatamente 32 times. Encontrados: ${times.length}`
            })
            return
        }

        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                regionais: true
            }
        })

        let totalTimesDistribuidos = 0
        const timesUtilizados = new Set<number>()

        for (const [regionalTipo, timeIds] of Object.entries(distribuicao)) {
            const idsArray = timeIds as number[]
            totalTimesDistribuidos += idsArray.length

            for (const timeId of idsArray) {
                if (timesUtilizados.has(timeId)) {
                    res.status(400).json({
                        error: `Time ID ${timeId} está duplicado na distribuição`
                    })
                    return
                }
                timesUtilizados.add(timeId)
            }
        }

        if (totalTimesDistribuidos !== 32) {
            res.status(400).json({
                error: `Deve distribuir exatamente 32 times. Distribuídos: ${totalTimesDistribuidos}`
            })
            return
        }

        await prisma.grupoTime.deleteMany({
            where: {
                grupo: {
                    campeonatoId
                }
            }
        })
        await prisma.grupo.deleteMany({
            where: { campeonatoId }
        })

        const gruposCriados = []
        for (const conferencia of conferencias) {
            for (const regional of conferencia.regionais) {
                const timesDoRegional = distribuicao[regional.tipo] || []

                if (timesDoRegional.length !== regional.timesPorRegional) {
                    res.status(400).json({
                        error: `Regional ${regional.nome} deve ter ${regional.timesPorRegional} times. Recebido: ${timesDoRegional.length}`
                    })
                    return
                }

                const grupo = await prisma.grupo.create({
                    data: {
                        nome: `Grupo ${regional.nome}`,
                        campeonatoId,
                        ordem: regional.ordem,
                        regionalId: regional.id
                    }
                })

                for (const timeId of timesDoRegional) {
                    await prisma.grupoTime.create({
                        data: {
                            grupoId: grupo.id,
                            timeId
                        }
                    })
                }

                gruposCriados.push({
                    grupo: grupo.nome,
                    regional: regional.nome,
                    conferencia: conferencia.nome,
                    times: timesDoRegional.length
                })
            }
        }

        res.status(200).json({
            message: 'Times distribuídos com sucesso!',
            distribuicao: {
                conferencias: conferencias.length,
                regionais: conferencias.reduce((acc, conf) => acc + conf.regionais.length, 0),
                times: totalTimesDistribuidos,
                grupos: gruposCriados
            }
        })
    } catch (error) {
        console.error('Erro ao distribuir times:', error)
        res.status(500).json({ error: 'Erro ao distribuir times na Superliga' })
    }
})

superligaRouter.post('/campeonatos/:id/distribuir-times-automatico', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        if (!campeonato.isSuperliga) {
            res.status(400).json({ error: 'Este campeonato não é uma Superliga' })
            return
        }

        const gruposExistentes = await prisma.grupo.count({
            where: { campeonatoId }
        })

        if (gruposExistentes > 0) {
            res.status(400).json({ error: 'Times já foram distribuídos para este campeonato' })
            return
        }

        const resultado = await distribuirTimesAutomaticamente(campeonatoId, campeonato.temporada)

        res.status(201).json({
            message: 'Times distribuídos automaticamente com sucesso!',
            ...resultado
        })
    } catch (error) {
        console.error('Erro ao distribuir times:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao distribuir times'
        })
    }
})

superligaRouter.post('/campeonatos/:id/gerar-jogos-temporada', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)
        const { rodadas = 4 } = req.body

        const jogosExistentes = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR'
            }
        })

        if (jogosExistentes > 0) {
            res.status(400).json({ error: 'Jogos da temporada regular já foram gerados' })
            return
        }

        const grupos = await prisma.grupo.findMany({
            where: { campeonatoId },
            include: {
                times: {
                    include: { time: true }
                }
            }
        })

        if (grupos.length === 0) {
            res.status(400).json({ error: 'Distribua os times antes de gerar jogos' })
            return
        }

        const jogosGerados = []
        const dataBase = new Date()
        let contadorJogo = 0

        for (const grupo of grupos) {
            const times = grupo.times.map(gt => gt.time)

            if (times.length < 2) continue

            for (let rodada = 1; rodada <= rodadas; rodada++) {
                for (let i = 0; i < times.length; i++) {
                    for (let j = i + 1; j < times.length; j++) {
                        const timeCasa = (contadorJogo % 2 === 0) ? times[i] : times[j]
                        const timeVisitante = (contadorJogo % 2 === 0) ? times[j] : times[i]

                        const dataJogo = new Date(dataBase)
                        dataJogo.setDate(dataBase.getDate() + (contadorJogo * 7)) 

                        const jogo = await prisma.jogo.create({
                            data: {
                                campeonatoId,
                                grupoId: grupo.id,
                                timeCasaId: timeCasa.id,
                                timeVisitanteId: timeVisitante.id,
                                dataJogo,
                                local: `Estádio do ${timeCasa.nome}`,
                                rodada,
                                fase: 'TEMPORADA_REGULAR',
                                status: 'AGENDADO'
                            }
                        })

                        jogosGerados.push(jogo)
                        contadorJogo++
                    }
                }
            }
        }

        res.status(201).json({
            message: `${jogosGerados.length} jogos da temporada regular gerados com sucesso!`,
            jogos: jogosGerados.length,
            rodadas,
            primeiroJogo: jogosGerados[0]?.dataJogo,
            ultimoJogo: jogosGerados[jogosGerados.length - 1]?.dataJogo
        })
    } catch (error) {
        console.error('Erro ao gerar jogos:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao gerar jogos'
        })
    }
})

superligaRouter.get('/campeonatos/:id/classificacao', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

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

        const classificacoes = []

        for (const grupo of grupos) {
            const classificacaoGrupo = []

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
                    } else if (pontosFeitos < pontosSofridos) {
                        derrotas++
                    }
                })

                classificacaoGrupo.push({
                    time: grupoTime.time,
                    jogos: jogos.length,
                    vitorias,
                    derrotas,
                    pontosPro,
                    pontosContra,
                    saldo: pontosPro - pontosContra,
                    aproveitamento: jogos.length > 0 ? (vitorias / jogos.length) * 100 : 0
                })
            }

            classificacaoGrupo.sort((a, b) => {
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                return b.pontosPro - a.pontosPro
            })

            classificacaoGrupo.forEach((item, index) => {
                (item as any).posicao = index + 1
            })

            classificacoes.push({
                grupo: grupo.nome,
                regional: grupo.regional?.nome,
                conferencia: grupo.regional?.conferencia.nome,
                classificacao: classificacaoGrupo
            })
        }

        res.status(200).json(classificacoes)
    } catch (error) {
        console.error('Erro ao buscar classificação:', error)
        res.status(500).json({ error: 'Erro ao buscar classificação' })
    }
})

superligaRouter.get('/campeonatos/:id/classificacao/:regional', async (req: Request, res: Response) => {
    try {
        const { id, regional } = req.params
        const campeonatoId = parseInt(id)

        const regionalData = await prisma.regional.findFirst({
            where: {
                tipo: regional.toUpperCase(),
                conferencia: {
                    campeonatoId
                }
            },
            include: {
                conferencia: true
            }
        })

        if (!regionalData) {
            res.status(404).json({ error: 'Regional não encontrado' })
            return
        }

        const grupo = await prisma.grupo.findFirst({
            where: {
                campeonatoId,
                regionalId: regionalData.id
            },
            include: {
                times: {
                    include: { time: true }
                }
            }
        })

        if (!grupo) {
            res.status(404).json({ error: 'Grupo não encontrado para este regional' })
            return
        }

        const classificacao = []

        for (const grupoTime of grupo.times) {
            const jogos = await prisma.jogo.findMany({
                where: {
                    campeonatoId,
                    grupoId: grupo.id,
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
                } else if (pontosFeitos < pontosSofridos) {
                    derrotas++
                }
            })

            classificacao.push({
                timeId: grupoTime.timeId,
                time: grupoTime.time,
                jogos: jogos.length,
                vitorias,
                derrotas,
                pontosPro,
                pontosContra,
                saldo: pontosPro - pontosContra,
                aproveitamento: jogos.length > 0 ? (vitorias / jogos.length) * 100 : 0
            })
        }

        classificacao.sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
        })

        classificacao.forEach((item, index) => {
            (item as any).posicao = index + 1
        })

        res.status(200).json({
            regionalId: regionalData.id,
            regional: regionalData.tipo as TipoRegional,
            conferencia: regionalData.conferencia.tipo as TipoConferencia,
            times: classificacao
        })
    } catch (error) {
        console.error('Erro ao buscar classificação do regional:', error)
        res.status(500).json({ error: 'Erro ao buscar classificação do regional' })
    }
})

superligaRouter.post('/campeonatos/:id/gerar-playoffs', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const jogosNaoFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR',
                status: { not: 'FINALIZADO' }
            }
        })

        if (jogosNaoFinalizados > 0) {
            res.status(400).json({
                error: `Ainda há ${jogosNaoFinalizados} jogos da temporada regular não finalizados`
            })
            return
        }

        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId }
        })

        const resultados = []

        for (const conferencia of conferencias) {
            let resultado

            switch (conferencia.tipo) {
                case 'SUDESTE':
                    resultado = await gerarPlayoffsSudeste(campeonatoId, conferencia.id)
                    break
                case 'SUL':
                    resultado = await gerarPlayoffsSul(campeonatoId, conferencia.id)
                    break
                case 'NORDESTE':
                    resultado = await gerarPlayoffsNordeste(campeonatoId, conferencia.id)
                    break
                case 'CENTRO_NORTE':
                    resultado = await gerarPlayoffsCentroNorte(campeonatoId, conferencia.id)
                    break
                default:
                    continue
            }

            resultados.push({
                conferencia: conferencia.tipo,
                ...resultado
            })
        }

        res.status(201).json({
            message: 'Playoffs gerados para todas as conferências!',
            conferencias: resultados.length,
            resultados
        })
    } catch (error) {
        console.error('Erro ao gerar playoffs:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao gerar playoffs'
        })
    }
})

superligaRouter.put('/playoffs/:id/atualizar-resultado', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const jogoId = parseInt(id)
        const { placarTime1, placarTime2, observacoes } = req.body

        const jogo = await prisma.playoffJogo.findUnique({
            where: { id: jogoId },
            include: {
                campeonato: true,
                conferencia: true
            }
        })

        if (!jogo) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        if (jogo.status === 'FINALIZADO') {
            res.status(400).json({ error: 'Este jogo já foi finalizado' })
            return
        }

        if (!jogo.timeClassificado1Id || !jogo.timeClassificado2Id) {
            res.status(400).json({ error: 'Os times ainda não foram definidos para este jogo' })
            return
        }

        const vencedorId = placarTime1 > placarTime2 ?
            jogo.timeClassificado1Id : jogo.timeClassificado2Id

        const jogoAtualizado = await prisma.playoffJogo.update({
            where: { id: jogoId },
            data: {
                placarTime1,
                placarTime2,
                timeVencedorId: vencedorId,
                status: 'FINALIZADO',
                observacoes
            }
        })

        const proximosJogos = await prisma.playoffJogo.findMany({
            where: {
                OR: [
                    { jogoAnterior1Id: jogoId },
                    { jogoAnterior2Id: jogoId }
                ]
            }
        })

        for (const proximoJogo of proximosJogos) {
            if (proximoJogo.jogoAnterior1Id === jogoId) {
                await prisma.playoffJogo.update({
                    where: { id: proximoJogo.id },
                    data: { timeClassificado1Id: vencedorId }
                })
            } else if (proximoJogo.jogoAnterior2Id === jogoId) {
                await prisma.playoffJogo.update({
                    where: { id: proximoJogo.id },
                    data: { timeClassificado2Id: vencedorId }
                })
            }
        }

        res.status(200).json({
            message: 'Resultado atualizado com sucesso!',
            jogo: jogoAtualizado,
            jogosAtualizados: proximosJogos.length
        })
    } catch (error) {
        console.error('Erro ao atualizar resultado:', error)
        res.status(500).json({ error: 'Erro ao atualizar resultado do jogo' })
    }
})

superligaRouter.get('/campeonatos/:id/playoffs/bracket', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                playoffJogos: {
                    include: {
                        timeClassificado1: true,
                        timeClassificado2: true,
                        timeVencedor: true
                    },
                    orderBy: [
                        { fase: 'asc' },
                        { rodada: 'asc' }
                    ]
                }
            }
        })

        const brackets = conferencias.map(conf => ({
            conferenciaId: conf.id,
            conferencia: conf.tipo as TipoConferencia,
            nome: conf.nome,
            icone: conf.icone,
            wildcards: conf.playoffJogos.filter(j => j.fase === 'WILD_CARD'),
            semifinais: conf.playoffJogos.filter(j => j.fase === 'SEMIFINAL_CONFERENCIA'),
            final: conf.playoffJogos.find(j => j.fase === 'FINAL_CONFERENCIA')
        }))

        res.status(200).json(brackets)
    } catch (error) {
        console.error('Erro ao buscar bracket:', error)
        res.status(500).json({ error: 'Erro ao buscar bracket dos playoffs' })
    }
})

superligaRouter.get('/campeonatos/:id/status', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                _count: {
                    select: {
                        jogos: true,
                        conferencias: true
                    }
                }
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        const jogosTemporadaRegular = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR',
                status: 'FINALIZADO'
            }
        })

        const jogosPlayoff = await prisma.playoffJogo.count({
            where: { campeonatoId }
        })

        const jogosPlayoffFinalizados = await prisma.playoffJogo.count({
            where: {
                campeonatoId,
                status: 'FINALIZADO'
            }
        })

        let fase = 'CONFIGURACAO'
        if (jogosTemporadaRegular > 0 && jogosFinalizados < jogosTemporadaRegular) {
            fase = 'TEMPORADA_REGULAR'
        } else if (jogosFinalizados === jogosTemporadaRegular && jogosPlayoff > 0) {
            fase = 'PLAYOFFS_CONFERENCIA'
        } else if (jogosPlayoffFinalizados === jogosPlayoff) {
            fase = 'FINALIZADO'
        }

        res.status(200).json({
            campeonato: {
                id: campeonato.id,
                nome: campeonato.nome,
                temporada: campeonato.temporada,
                status: campeonato.status
            },
            fase,
            estatisticas: {
                jogosTemporadaRegular,
                jogosFinalizados,
                jogosPlayoff,
                jogosPlayoffFinalizados,
                conferencias: campeonato._count.conferencias
            }
        })
    } catch (error) {
        console.error('Erro ao buscar status:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao buscar status'
        })
    }
})

superligaRouter.get('/campeonatos/:id/validar-estrutura', async (req: Request, res: Response) => {
    try {
        const campeonatoId = validarId(req.params.id)

        const conferencias = await prisma.conferencia.count({
            where: { campeonatoId }
        })

        const regionais = await prisma.regional.count({
            where: {
                conferencia: { campeonatoId }
            }
        })

        const grupos = await prisma.grupo.count({
            where: { campeonatoId }
        })

        const timesDistribuidos = await prisma.grupoTime.count({
            where: {
                grupo: { campeonatoId }
            }
        })

        const erros = []
        const avisos = []

        if (conferencias !== 4) {
            erros.push(`Superliga deve ter 4 conferências. Encontradas: ${conferencias}`)
        } else {
            avisos.push('✓ 4 conferências configuradas')
        }

        if (regionais !== 8) {
            erros.push(`Superliga deve ter 8 regionais. Encontrados: ${regionais}`)
        } else {
            avisos.push('✓ 8 regionais configurados')
        }

        if (timesDistribuidos !== 32) {
            erros.push(`Superliga deve ter 32 times. Distribuídos: ${timesDistribuidos}`)
        } else {
            avisos.push('✓ 32 times distribuídos')
        }

        res.status(200).json({
            valida: erros.length === 0,
            erros,
            avisos,
            estatisticas: {
                conferencias,
                regionais,
                grupos,
                timesDistribuidos
            }
        })
    } catch (error) {
        console.error('Erro ao validar estrutura:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao validar estrutura'
        })
    }
})

superligaRouter.post('/campeonatos/:id/gerar-fase-nacional', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                playoffJogos: {
                    where: {
                        fase: 'FINAL_CONFERENCIA',
                        status: 'FINALIZADO'
                    },
                    include: {
                        timeVencedor: true
                    }
                }
            }
        })

        const campeoes = []
        for (const conf of conferencias) {
            const finalConferencia = conf.playoffJogos[0]
            if (!finalConferencia || !finalConferencia.timeVencedorId) {
                res.status(400).json({
                    error: `A conferência ${conf.nome} ainda não tem um campeão definido`
                })
                return
            }
            campeoes.push({
                conferencia: conf.tipo,
                timeId: finalConferencia.timeVencedorId,
                time: finalConferencia.timeVencedor
            })
        }

        const dataBase = new Date()
        dataBase.setDate(dataBase.getDate() + 7)

        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 1,
                nome: 'Semifinal Nacional 1',
                timeClassificado1Id: campeoes.find(c => c.conferencia === 'SUL')?.timeId,
                timeClassificado2Id: campeoes.find(c => c.conferencia === 'SUDESTE')?.timeId,
                dataJogo: dataBase,
                status: 'AGUARDANDO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 1,
                nome: 'Semifinal Nacional 2',
                timeClassificado1Id: campeoes.find(c => c.conferencia === 'NORDESTE')?.timeId,
                timeClassificado2Id: campeoes.find(c => c.conferencia === 'CENTRO_NORTE')?.timeId,
                dataJogo: dataBase,
                status: 'AGUARDANDO'
            }
        })

        const dataFinal = new Date(dataBase)
        dataFinal.setDate(dataFinal.getDate() + 7)

        const finalNacional = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'FINAL_NACIONAL',
                rodada: 1,
                nome: 'Grande Final Nacional',
                jogoAnterior1Id: semifinal1.id,
                jogoAnterior2Id: semifinal2.id,
                dataJogo: dataFinal,
                status: 'AGUARDANDO'
            }
        })

        res.status(201).json({
            message: 'Fase nacional gerada com sucesso!',
            jogos: {
                semifinal1,
                semifinal2,
                final: finalNacional
            }
        })
    } catch (error) {
        console.error('Erro ao gerar fase nacional:', error)
        res.status(500).json({ error: 'Erro ao gerar fase nacional' })
    }
})

superligaRouter.post('/campeonatos/:id/gerar-semifinais-nacionais', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const resultado = await gerarSemifinaisNacionais(campeonatoId)
    
    res.status(201).json({
      message: 'Semifinais nacionais geradas com sucesso!',
      campeonatoId,
      ...resultado
    })
  } catch (error) {
    console.error('Erro ao gerar semifinais nacionais:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar semifinais nacionais'
    })
  }
})

superligaRouter.post('/campeonatos/:id/gerar-final-nacional', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const resultado = await gerarFinalNacional(campeonatoId)
    
    res.status(201).json({
      message: 'Final nacional gerada com sucesso!',
      campeonatoId,
      ...resultado
    })
  } catch (error) {
    console.error('Erro ao gerar final nacional:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar final nacional'
    })
  }
})

superligaRouter.get('/campeonatos/:id/fase-nacional', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const faseNacional = await getFaseNacional(campeonatoId)
    
    res.status(200).json(faseNacional)
  } catch (error) {
    console.error('Erro ao buscar fase nacional:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao buscar fase nacional'
    })
  }
})

superligaRouter.get('/campeonatos/:id/ranking-geral', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const ranking = await calcularRankingGeral(campeonatoId)
    
    res.status(200).json(ranking)
  } catch (error) {
    console.error('Erro ao calcular ranking geral:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao calcular ranking geral'
    })
  }
})

superligaRouter.get('/campeonatos/:id/wild-card-ranking/:conferencia', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const { conferencia } = req.params
    
    const ranking = await getWildCardRanking(campeonatoId, conferencia.toUpperCase())
    
    res.status(200).json({
      conferencia: conferencia.toUpperCase(),
      ...ranking
    })
  } catch (error) {
    console.error('Erro ao calcular ranking wild card:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao calcular ranking wild card'
    })
  }
})

superligaRouter.get('/campeonatos/:id/validar-integridade', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const validacao = await validarIntegridadeSuperliga(campeonatoId)
    
    res.status(200).json(validacao)
  } catch (error) {
    console.error('Erro ao validar integridade:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao validar integridade'
    })
  }
})

superligaRouter.post('/campeonatos/:id/reparar-integridade', async (req: Request, res: Response) => {
  try {
    const campeonatoId = validarId(req.params.id)
    const reparos = await repararIntegridadeSuperliga(campeonatoId)
    
    res.status(200).json({
      message: 'Reparos executados',
      campeonatoId,
      ...reparos
    })
  } catch (error) {
    console.error('Erro ao reparar integridade:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao reparar integridade'
    })
  }
})

export { superligaRouter }

export default superligaRouter