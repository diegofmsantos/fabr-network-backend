import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { z } from 'zod'
import { validate, validateParams, validateQuery } from '../middleware/validations'
import { 
  CriarSuperligaSchema,
  DistribuirTimesSchema,
  GerarJogosSchema,
  GerarPlayoffsSchema,
  AtualizarJogoPlayoffSchema
} from '../schemas/Superliga'
import { 
  gerarPlayoffsSudeste, 
  gerarPlayoffsSul, 
  gerarPlayoffsNordeste, 
  gerarPlayoffsCentroNorte 
} from '../utils/superligaUtils'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA, TipoConferencia, TipoRegional } from '../types'

const prisma = new PrismaClient()
const superligaRouter = express.Router()

// ==================== CRIAÇÃO DA SUPERLIGA ====================

// POST /criar - Criar campeonato da Superliga
superligaRouter.post('/criar', validate(CriarSuperligaSchema), async (req: Request, res: Response) => {
    try {
        const { temporada, nome, dataInicio, descricao } = req.body

        // Verificar se já existe Superliga para a temporada
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
                tipo: 'SUPERLIGA',
                status: 'NAO_INICIADO',
                dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                descricao,
                isSuperliga: true,
                configSuperliga: JSON.parse(JSON.stringify(SUPERLIGA_CONFIG)),
                formato: {
                    tipo: 'SUPERLIGA',
                    temporadaRegular: {
                        rodadas: 4,
                        pontosVitoria: 1,
                        pontosEmpate: 0
                    },
                    playoffs: {
                        estrutura: 'CONFERENCIAS_REGIONAIS',
                        faseNacional: true
                    }
                }
            }
        })

        // Criar conferências automaticamente
        for (const [index, confConfig] of SUPERLIGA_CONFIG.entries()) {
            const conferencia = await prisma.conferencia.create({
                data: {
                    nome: confConfig.nome,
                    tipo: confConfig.tipo,
                    icone: confConfig.icone,
                    campeonatoId: campeonato.id,
                    ordem: index + 1,
                    totalTimes: confConfig.totalTimes
                }
            })

            // Criar regionais para esta conferência
            for (const [regIndex, regConfig] of confConfig.regionais.entries()) {
                await prisma.regional.create({
                    data: {
                        nome: regConfig.nome,
                        tipo: regConfig.tipo,
                        conferenciaId: conferencia.id,
                        ordem: regIndex + 1,
                        timesPorRegional: regConfig.timesPorRegional
                    }
                })
            }
        }

        res.status(201).json({
            ...campeonato,
            message: 'Superliga criada com sucesso!'
        })
    } catch (error) {
        console.error('Erro ao criar Superliga:', error)
        res.status(500).json({ error: 'Erro ao criar Superliga' })
    }
})

// ==================== CONFIGURAÇÃO DE TIMES ====================

// POST /campeonatos/:id/distribuir-times-superliga
superligaRouter.post('/campeonatos/:id/distribuir-times-superliga', 
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    validate(DistribuirTimesSchema),
    async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)
        const { distribuicao } = req.body

        // Verificar se o campeonato existe e é Superliga
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

        // Buscar times da temporada
        const times = await prisma.time.findMany({
            where: { temporada: campeonato.temporada }
        })

        if (times.length !== 32) {
            res.status(400).json({ 
                error: `Superliga precisa de exatamente 32 times. Encontrados: ${times.length}` 
            })
            return
        }

        // Buscar conferências e regionais
        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: {
                regionais: true
            }
        })

        // Validar distribuição
        let totalTimesDistribuidos = 0
        const timesUtilizados = new Set<number>()

        for (const [regionalTipo, timeIds] of Object.entries(distribuicao)) {
            const idsArray = timeIds as number[]
            totalTimesDistribuidos += idsArray.length
            
            // Verificar duplicatas
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

        // Limpar grupos existentes
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

        // Criar grupos e associar times
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
                
                // Criar grupo para o regional
                const grupo = await prisma.grupo.create({
                    data: {
                        nome: `Grupo ${regional.nome}`,
                        campeonatoId,
                        ordem: regional.ordem,
                        regionalId: regional.id
                    }
                })

                // Associar times ao grupo
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

// ==================== GERAÇÃO DE JOGOS ====================

// POST /campeonatos/:id/gerar-jogos-temporada
superligaRouter.post('/campeonatos/:id/gerar-jogos-temporada',
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    validate(GerarJogosSchema),
    async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)
        const { rodadas = 4, algoritmo = 'ROUND_ROBIN' } = req.body

        // Verificar se pode gerar jogos
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                jogos: {
                    where: { fase: 'TEMPORADA_REGULAR' }
                }
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        if (campeonato.jogos.length > 0) {
            res.status(400).json({ error: 'Já existem jogos gerados para este campeonato' })
            return
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
            res.status(400).json({ error: 'Distribua os times antes de gerar jogos' })
            return
        }

        const jogosGerados = []
        const dataBase = new Date()
        let contadorSemana = 0

        if (algoritmo === 'ROUND_ROBIN') {
            // Gerar jogos dentro de cada regional
            for (const grupo of grupos) {
                const times = grupo.times.map(gt => gt.time)
                
                if (times.length < 2) continue

                // Round-robin: cada time joga contra todos do regional
                for (let rodada = 1; rodada <= rodadas; rodada++) {
                    for (let i = 0; i < times.length; i++) {
                        for (let j = i + 1; j < times.length; j++) {
                            // Alternar mando de campo entre rodadas
                            const timeCasa = rodada % 2 === 0 ? times[j] : times[i]
                            const timeVisitante = rodada % 2 === 0 ? times[i] : times[j]

                            const dataJogo = new Date(dataBase)
                            dataJogo.setDate(dataJogo.getDate() + (contadorSemana * 7))

                            const jogo = await prisma.jogo.create({
                                data: {
                                    campeonatoId,
                                    grupoId: grupo.id,
                                    timeCasaId: timeCasa.id,
                                    timeVisitanteId: timeVisitante.id,
                                    dataJogo,
                                    rodada,
                                    fase: 'TEMPORADA_REGULAR',
                                    status: 'AGENDADO',
                                    local: `Estádio ${timeCasa.nome}`
                                }
                            })
                            jogosGerados.push(jogo)
                        }
                    }
                    contadorSemana++
                }
            }

            // Gerar alguns jogos inter-regionais (opcional)
            const jogosInterRegionais = Math.floor(rodadas * 0.25) // 25% dos jogos são inter-regionais
            
            for (let i = 0; i < jogosInterRegionais; i++) {
                // Selecionar dois grupos aleatórios da mesma conferência
                const grupoA = grupos[Math.floor(Math.random() * grupos.length)]
                const gruposMessaConferencia = grupos.filter(g => 
                    g.regional?.conferenciaId === grupoA.regional?.conferenciaId && 
                    g.id !== grupoA.id
                )
                
                if (gruposMessaConferencia.length > 0) {
                    const grupoB = gruposMessaConferencia[Math.floor(Math.random() * gruposMessaConferencia.length)]
                    const timeA = grupoA.times[Math.floor(Math.random() * grupoA.times.length)].time
                    const timeB = grupoB.times[Math.floor(Math.random() * grupoB.times.length)].time

                    const dataJogo = new Date(dataBase)
                    dataJogo.setDate(dataJogo.getDate() + (contadorSemana * 7))

                    const jogo = await prisma.jogo.create({
                        data: {
                            campeonatoId,
                            timeCasaId: timeA.id,
                            timeVisitanteId: timeB.id,
                            dataJogo,
                            rodada: rodadas,
                            fase: 'TEMPORADA_REGULAR',
                            status: 'AGENDADO',
                            local: `Estádio ${timeA.nome}`,
                            observacoes: 'Jogo Inter-Regional'
                        }
                    })
                    jogosGerados.push(jogo)
                }
            }
        }

        // Atualizar status do campeonato
        await prisma.campeonato.update({
            where: { id: campeonatoId },
            data: { status: 'EM_ANDAMENTO' }
        })

        res.status(201).json({
            message: 'Jogos da temporada regular gerados com sucesso!',
            estatisticas: {
                totalJogos: jogosGerados.length,
                jogosPorRodada: Math.floor(jogosGerados.length / rodadas),
                rodadas,
                primeiroJogo: jogosGerados[0]?.dataJogo,
                ultimoJogo: jogosGerados[jogosGerados.length - 1]?.dataJogo,
                semanasDuracao: contadorSemana
            }
        })
    } catch (error) {
        console.error('Erro ao gerar jogos:', error)
        res.status(500).json({ error: 'Erro ao gerar jogos da temporada' })
    }
})

// ==================== CLASSIFICAÇÃO ====================

// GET /campeonatos/:id/classificacao
superligaRouter.get('/campeonatos/:id/classificacao',
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    async (req: Request, res: Response) => {
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
                // Buscar jogos do time
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

            // Ordenar classificação
            classificacaoGrupo.sort((a, b) => {
                // 1. Número de vitórias
                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                // 2. Saldo de pontos
                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                // 3. Pontos marcados
                return b.pontosPro - a.pontosPro
            })

            // Adicionar posição
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

// GET /campeonatos/:id/classificacao/:regional
superligaRouter.get('/campeonatos/:id/classificacao/:regional',
    validateParams(z.object({ 
        id: z.string().regex(/^\d+$/),
        regional: z.string()
    })),
    async (req: Request, res: Response) => {
    try {
        const { id, regional } = req.params
        const campeonatoId = parseInt(id)

        // Buscar regional
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

        // Buscar grupo do regional
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

        // Ordenar classificação
        classificacao.sort((a, b) => {
            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
            if (b.saldo !== a.saldo) return b.saldo - a.saldo
            return b.pontosPro - a.pontosPro
        })

        // Adicionar posição
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

// ==================== PLAYOFFS ====================

// POST /campeonatos/:id/gerar-playoffs/:conferencia
superligaRouter.post('/campeonatos/:id/gerar-playoffs/:conferencia',
    validateParams(z.object({ 
        id: z.string().regex(/^\d+$/),
        conferencia: z.string()
    })),
    async (req: Request, res: Response) => {
    try {
        const { id, conferencia } = req.params
        const campeonatoId = parseInt(id)
        const tipoConferencia = conferencia.toUpperCase() as TipoConferencia

        // Verificar se a temporada regular acabou
        const jogosTemporada = await prisma.jogo.findMany({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR',
                status: { not: 'FINALIZADO' }
            }
        })

        if (jogosTemporada.length > 0) {
            res.status(400).json({ 
                error: `Ainda há ${jogosTemporada.length} jogos da temporada regular não finalizados` 
            })
            return
        }

        // Buscar conferência
        const conferenciaData = await prisma.conferencia.findFirst({
            where: {
                campeonatoId,
                tipo: tipoConferencia
            }
        })

        if (!conferenciaData) {
            res.status(404).json({ error: 'Conferência não encontrada' })
            return
        }

        let jogosPlayoff = []

        // Gerar playoffs baseado na conferência
        switch (tipoConferencia) {
            case 'SUDESTE':
                jogosPlayoff = await gerarPlayoffsSudeste(campeonatoId, conferenciaData.id)
                break
            case 'SUL':
                jogosPlayoff = await gerarPlayoffsSul(campeonatoId, conferenciaData.id)
                break
            case 'NORDESTE':
                jogosPlayoff = await gerarPlayoffsNordeste(campeonatoId, conferenciaData.id)
                break
            case 'CENTRO_NORTE':
                jogosPlayoff = await gerarPlayoffsCentroNorte(campeonatoId, conferenciaData.id)
                break
            default:
                res.status(400).json({ error: 'Tipo de conferência inválido' })
                return
        }

        res.status(201).json({
            message: `Playoffs da conferência ${conferencia} gerados com sucesso!`,
            jogosGerados: jogosPlayoff.length,
            fases: {
                wildcard: jogosPlayoff.filter(j => j.fase === 'WILD_CARD').length,
                semifinal: jogosPlayoff.filter(j => j.fase === 'SEMIFINAL_CONFERENCIA').length,
                final: jogosPlayoff.filter(j => j.fase === 'FINAL_CONFERENCIA').length
            }
        })
    } catch (error) {
        console.error('Erro ao gerar playoffs:', error)
        res.status(500).json({ error: 'Erro ao gerar playoffs' })
    }
})

// PUT /playoffs/:id/atualizar-resultado
superligaRouter.put('/playoffs/:id/atualizar-resultado',
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    validate(AtualizarJogoPlayoffSchema),
    async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const jogoId = parseInt(id)
        const { placarTime1, placarTime2, observacoes } = req.body

        // Buscar jogo
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

        // Determinar vencedor
        const vencedorId = placarTime1 > placarTime2 ? 
            jogo.timeClassificado1Id : jogo.timeClassificado2Id

        // Atualizar jogo
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

        // Atualizar próximos jogos se necessário
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

// GET /campeonatos/:id/playoffs/bracket
superligaRouter.get('/campeonatos/:id/playoffs/bracket',
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    async (req: Request, res: Response) => {
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

// POST /campeonatos/:id/gerar-fase-nacional
superligaRouter.post('/campeonatos/:id/gerar-fase-nacional',
    validateParams(z.object({ id: z.string().regex(/^\d+$/) })),
    async (req: Request, res: Response) => {
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

export default superligaRouter