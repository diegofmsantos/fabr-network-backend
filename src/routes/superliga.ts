import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { gerarPlayoffsSudeste, gerarPlayoffsSul, gerarPlayoffsNordeste, gerarPlayoffsCentroNorte } from '../utils/superligaUtils'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA } from '../types'

const prisma = new PrismaClient()
export const superligaRouter = express.Router()

// ==================== CRIAÇÃO DA SUPERLIGA ====================

// POST /superliga/criar - Criar campeonato da Superliga
superligaRouter.post('/criar', async (req: Request, res: Response) => {
    try {
        const { temporada, nome, tipo } = req.body

        const campeonato = await prisma.campeonato.create({
            data: {
                nome: nome || `Superliga de Futebol Americano ${temporada}`,
                temporada,
                tipo: 'SUPERLIGA',
                status: 'NAO_INICIADO',
                dataInicio: new Date(),
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
superligaRouter.post('/campeonatos/:id/distribuir-times-superliga', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        // Buscar times da temporada do campeonato
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
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

        // Distribuir times por regional baseado nos nomes
        const distribuicao: Record<string, number[]> = {}
        
        for (const [regionalKey, nomesEsperados] of Object.entries(TIMES_SUPERLIGA)) {
            distribuicao[regionalKey] = []
            
            for (const nomeEsperado of nomesEsperados) {
                const time = times.find(t => 
                    t.nome.toLowerCase().includes(nomeEsperado.toLowerCase()) ||
                    nomeEsperado.toLowerCase().includes(t.nome.toLowerCase())
                )
                
                if (time) {
                    distribuicao[regionalKey].push(time.id)
                }
            }
        }

        // Criar grupos para cada regional e associar times
        const regionais = await prisma.regional.findMany({
            where: {
                conferencia: {
                    campeonatoId
                }
            },
            include: {
                conferencia: true
            }
        })

        for (const regional of regionais) {
            const timeIds = distribuicao[regional.tipo] || []
            
            if (timeIds.length > 0) {
                // Criar grupo para este regional
                const grupo = await prisma.grupo.create({
                    data: {
                        nome: regional.nome,
                        campeonatoId,
                        regionalId: regional.id,
                        ordem: regional.ordem
                    }
                })

                // Associar times ao grupo
                const grupoTimes = timeIds.map(timeId => ({
                    grupoId: grupo.id,
                    timeId
                }))

                await prisma.grupoTime.createMany({
                    data: grupoTimes
                })

                // Criar classificação inicial
                const classificacoes = timeIds.map((timeId, index) => ({
                    grupoId: grupo.id,
                    timeId,
                    posicao: index + 1
                }))

                await prisma.classificacaoGrupo.createMany({
                    data: classificacoes
                })
            }
        }

        res.status(200).json({
            message: 'Times distribuídos com sucesso!',
            distribuicao,
            regionais: regionais.length,
            gruposCriados: regionais.length
        })
    } catch (error) {
        console.error('Erro ao distribuir times:', error)
        res.status(500).json({ error: 'Erro ao distribuir times' })
    }
})

// ==================== TEMPORADA REGULAR ====================

// POST /campeonatos/:id/gerar-jogos-superliga
superligaRouter.post('/campeonatos/:id/gerar-jogos-superliga', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        // Buscar todos os grupos (regionais) do campeonato
        const grupos = await prisma.grupo.findMany({
            where: { campeonatoId },
            include: {
                times: {
                    include: {
                        time: true
                    }
                },
                regional: true
            }
        })

        let totalJogos = 0

        for (const grupo of grupos) {
            const times = grupo.times.map(gt => gt.time)
            
            if (times.length < 2) continue

            // Gerar jogos dentro do regional (todos contra todos - 4 rodadas)
            const jogos = []
            
            for (let rodada = 1; rodada <= 4; rodada++) {
                for (let i = 0; i < times.length; i++) {
                    for (let j = i + 1; j < times.length; j++) {
                        const timeCasa = rodada % 2 === 1 ? times[i] : times[j]
                        const timeVisitante = rodada % 2 === 1 ? times[j] : times[i]

                        jogos.push({
                            campeonatoId,
                            grupoId: grupo.id,
                            timeCasaId: timeCasa.id,
                            timeVisitanteId: timeVisitante.id,
                            dataJogo: new Date(Date.now() + (rodada * 7 * 24 * 60 * 60 * 1000)), // Uma semana entre rodadas
                            rodada,
                            fase: 'FASE_GRUPOS',
                            status: 'AGENDADO'
                        })
                    }
                }
            }

            // Limitar a 4 jogos por time (conforme briefing)
            const jogosPorTime = new Map<number, number>()
            const jogosFiltrados = []

            for (const jogo of jogos) {
                const jogosCasa = jogosPorTime.get(jogo.timeCasaId) || 0
                const jogosVisitante = jogosPorTime.get(jogo.timeVisitanteId) || 0

                if (jogosCasa < 4 && jogosVisitante < 4) {
                    jogosFiltrados.push(jogo)
                    jogosPorTime.set(jogo.timeCasaId, jogosCasa + 1)
                    jogosPorTime.set(jogo.timeVisitanteId, jogosVisitante + 1)
                }
            }

            if (jogosFiltrados.length > 0) {
                await prisma.jogo.createMany({
                    data: jogosFiltrados
                })
                totalJogos += jogosFiltrados.length
            }
        }

        // Atualizar status do campeonato
        await prisma.campeonato.update({
            where: { id: campeonatoId },
            data: { status: 'EM_ANDAMENTO' }
        })

        res.status(200).json({
            message: 'Jogos da temporada regular gerados!',
            totalJogos,
            grupos: grupos.length,
            jogosPorTime: 4
        })
    } catch (error) {
        console.error('Erro ao gerar jogos:', error)
        res.status(500).json({ error: 'Erro ao gerar jogos da temporada regular' })
    }
})

// ==================== PLAYOFFS ====================

// POST /campeonatos/:id/gerar-playoffs-superliga
superligaRouter.post('/campeonatos/:id/gerar-playoffs-superliga', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        // Verificar se a temporada regular foi finalizada
        const jogosRegulares = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'FASE_GRUPOS',
                status: { not: 'FINALIZADO' }
            }
        })

        if (jogosRegulares > 0) {
            res.status(400).json({ 
                error: `Ainda há ${jogosRegulares} jogos da temporada regular não finalizados` 
            })
            return
        }

        // Gerar playoffs para cada conferência
        const resultados = {
            sudeste: await gerarPlayoffsSudeste(campeonatoId),
            sul: await gerarPlayoffsSul(campeonatoId),
            nordeste: await gerarPlayoffsNordeste(campeonatoId),
            centroNorte: await gerarPlayoffsCentroNorte(campeonatoId)
        }

        res.status(200).json({
            message: 'Playoffs da Superliga gerados!',
            ...resultados
        })
    } catch (error) {
        console.error('Erro ao gerar playoffs:', error)
        res.status(500).json({ error: 'Erro ao gerar playoffs da Superliga' })
    }
})

// GET /campeonatos/:id/playoff-bracket
superligaRouter.get('/campeonatos/:id/playoff-bracket', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const playoffJogos = await prisma.playoffJogo.findMany({
            where: { campeonatoId },
            include: {
                timeClassificado1: {
                    select: { id: true, nome: true, sigla: true, logo: true }
                },
                timeClassificado2: {
                    select: { id: true, nome: true, sigla: true, logo: true }
                },
                timeVencedor: {
                    select: { id: true, nome: true, sigla: true, logo: true }
                },
                conferencia: true
            },
            orderBy: [
                { conferenciaId: 'asc' },
                { fase: 'asc' },
                { rodada: 'asc' }
            ]
        })

        // Organizar por conferência
        const bracket = {
            temporada: '',
            status: 'PLAYOFFS',
            playoffsSudeste: playoffJogos.filter(j => j.conferencia?.tipo === 'SUDESTE'),
            playoffsSul: playoffJogos.filter(j => j.conferencia?.tipo === 'SUL'),
            playoffsNordeste: playoffJogos.filter(j => j.conferencia?.tipo === 'NORDESTE'),
            playoffsCentroNorte: playoffJogos.filter(j => j.conferencia?.tipo === 'CENTRO_NORTE'),
            semifinalNacional1: playoffJogos.filter(j => j.fase === 'SEMIFINAL_NACIONAL'),
            semifinalNacional2: [],
            finalNacional: playoffJogos.find(j => j.fase === 'FINAL_NACIONAL')
        }

        res.status(200).json(bracket)
    } catch (error) {
        console.error('Erro ao buscar bracket:', error)
        res.status(500).json({ error: 'Erro ao buscar chaveamento dos playoffs' })
    }
})

// ==================== CLASSIFICAÇÃO ====================

// GET /campeonatos/:id/classificacao/:conferencia
superligaRouter.get('/campeonatos/:id/classificacao/:conferencia', async (req: Request, res: Response) => {
    try {
        const { id, conferencia } = req.params
        const campeonatoId = parseInt(id)

        const classificacao = await prisma.classificacaoGrupo.findMany({
            where: {
                grupo: {
                    campeonatoId,
                    regional: {
                        conferencia: {
                            tipo: conferencia.toUpperCase()
                        }
                    }
                }
            },
            include: {
                time: {
                    select: { id: true, nome: true, sigla: true, cor: true, logo: true }
                },
                grupo: {
                    include: {
                        regional: {
                            include: {
                                conferencia: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { grupo: { ordem: 'asc' } },
                { posicao: 'asc' }
            ]
        })

        res.status(200).json(classificacao)
    } catch (error) {
        console.error('Erro ao buscar classificação:', error)
        res.status(500).json({ error: 'Erro ao buscar classificação da conferência' })
    }
})

// ==================== UTILITÁRIOS ====================

// GET /campeonatos/:id/status
superligaRouter.get('/campeonatos/:id/status', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                _count: {
                    select: {
                        grupos: true,
                        jogos: true
                    }
                }
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: 'Campeonato não encontrado' })
            return
        }

        // Verificar status atual
        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                status: 'FINALIZADO'
            }
        })

        const jogosPlayoff = await prisma.playoffJogo.count({
            where: { campeonatoId }
        })

        let fase: string
        let proximoPasso: string
        let podeAvancar = true

        if (campeonato._count.grupos === 0) {
            fase = 'CONFIGURACAO'
            proximoPasso = 'Distribuir times nas conferências'
        } else if (campeonato._count.jogos === 0) {
            fase = 'CONFIGURACAO'
            proximoPasso = 'Gerar jogos da temporada regular'
        } else if (jogosFinalizados < campeonato._count.jogos) {
            fase = 'TEMPORADA_REGULAR'
            proximoPasso = `Finalizar ${campeonato._count.jogos - jogosFinalizados} jogos restantes`
            podeAvancar = false
        } else if (jogosPlayoff === 0) {
            fase = 'TEMPORADA_REGULAR'
            proximoPasso = 'Gerar playoffs'
        } else {
            fase = 'PLAYOFFS'
            proximoPasso = 'Disputar jogos dos playoffs'
        }

        res.status(200).json({
            fase,
            proximoPasso,
            podeAvancar,
            estatisticas: {
                grupos: campeonato._count.grupos,
                jogosTotal: campeonato._count.jogos,
                jogosFinalizados,
                jogosPlayoff
            }
        })
    } catch (error) {
        console.error('Erro ao buscar status:', error)
        res.status(500).json({ error: 'Erro ao buscar status da Superliga' })
    }
})

// POST /campeonatos/:id/validar-estrutura
superligaRouter.get('/campeonatos/:id/validar-estrutura', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const erros: string[] = []
        const avisos: string[] = []

        // Verificar se o campeonato existe e é Superliga
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                conferencias: {
                    include: {
                        regionais: {
                            include: {
                                grupos: {
                                    include: {
                                        times: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!campeonato) {
            erros.push('Campeonato não encontrado')
        } else if (!campeonato.isSuperliga) {
            erros.push('Campeonato não é uma Superliga')
        } else {
            // Validar estrutura de conferências
            if (campeonato.conferencias.length !== 4) {
                erros.push(`Superliga deve ter 4 conferências. Encontradas: ${campeonato.conferencias.length}`)
            }

            let totalTimes = 0
            for (const conferencia of campeonato.conferencias) {
                const timesConferencia = conferencia.regionais.reduce((acc, regional) => {
                    return acc + regional.grupos.reduce((acc2, grupo) => acc2 + grupo.times.length, 0)
                }, 0)

                totalTimes += timesConferencia

                // Validar cada conferência
                switch (conferencia.tipo) {
                    case 'SUDESTE':
                        if (conferencia.regionais.length !== 3) {
                            erros.push(`Conferência Sudeste deve ter 3 regionais. Encontrados: ${conferencia.regionais.length}`)
                        }
                        if (timesConferencia !== 12) {
                            erros.push(`Conferência Sudeste deve ter 12 times. Encontrados: ${timesConferencia}`)
                        }
                        break
                    case 'SUL':
                        if (conferencia.regionais.length !== 2) {
                            erros.push(`Conferência Sul deve ter 2 regionais. Encontrados: ${conferencia.regionais.length}`)
                        }
                        if (timesConferencia !== 8) {
                            erros.push(`Conferência Sul deve ter 8 times. Encontrados: ${timesConferencia}`)
                        }
                        break
                    case 'NORDESTE':
                        if (conferencia.regionais.length !== 1) {
                            erros.push(`Conferência Nordeste deve ter 1 regional. Encontrados: ${conferencia.regionais.length}`)
                        }
                        if (timesConferencia !== 6) {
                            erros.push(`Conferência Nordeste deve ter 6 times. Encontrados: ${timesConferencia}`)
                        }
                        break
                    case 'CENTRO_NORTE':
                        if (conferencia.regionais.length !== 2) {
                            erros.push(`Conferência Centro-Norte deve ter 2 regionais. Encontrados: ${conferencia.regionais.length}`)
                        }
                        if (timesConferencia !== 6) {
                            erros.push(`Conferência Centro-Norte deve ter 6 times. Encontrados: ${timesConferencia}`)
                        }
                        break
                }
            }

            if (totalTimes !== 32) {
                erros.push(`Superliga deve ter exatamente 32 times. Encontrados: ${totalTimes}`)
            }

            // Avisos
            if (totalTimes === 32 && erros.length === 0) {
                avisos.push('Estrutura da Superliga está correta!')
            }
        }

        res.status(200).json({
            valida: erros.length === 0,
            erros,
            avisos
        })
    } catch (error) {
        console.error('Erro ao validar estrutura:', error)
        res.status(500).json({ error: 'Erro ao validar estrutura da Superliga' })
    }
})

// ==================== FASE NACIONAL ====================

// POST /campeonatos/:id/gerar-semifinais-nacionais
superligaRouter.post('/campeonatos/:id/gerar-semifinais-nacionais', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        // Buscar campeões de cada conferência
        const campeoesSudeste = await prisma.playoffJogo.findFirst({
            where: {
                campeonatoId,
                fase: 'FINAL_CONF',
                conferencia: { tipo: 'SUDESTE' },
                status: 'FINALIZADO'
            },
            include: { timeVencedor: true }
        })

        const campeoesSul = await prisma.playoffJogo.findFirst({
            where: {
                campeonatoId,
                fase: 'FINAL_CONF',
                conferencia: { tipo: 'SUL' },
                status: 'FINALIZADO'
            },
            include: { timeVencedor: true }
        })

        const campeoesNordeste = await prisma.playoffJogo.findFirst({
            where: {
                campeonatoId,
                fase: 'FINAL_CONF',
                conferencia: { tipo: 'NORDESTE' },
                status: 'FINALIZADO'
            },
            include: { timeVencedor: true }
        })

        const campeoesCentroNorte = await prisma.playoffJogo.findFirst({
            where: {
                campeonatoId,
                fase: 'FINAL_CONF',
                conferencia: { tipo: 'CENTRO_NORTE' },
                status: 'FINALIZADO'
            },
            include: { timeVencedor: true }
        })

        if (!campeoesSudeste?.timeVencedor || !campeoesSul?.timeVencedor || 
            !campeoesNordeste?.timeVencedor || !campeoesCentroNorte?.timeVencedor) {
            res.status(400).json({ 
                error: 'Nem todas as finais de conferência foram concluídas' 
            })
            return
        }

        // Criar semifinais nacionais conforme briefing
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 1,
                nome: 'Semifinal Nacional 1: Sul × Sudeste',
                timeClassificado1Id: campeoesSul.timeVencedorId,
                timeClassificado2Id: campeoesSudeste.timeVencedorId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 semana
                status: 'AGENDADO'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'SEMIFINAL_NACIONAL',
                rodada: 2,
                nome: 'Semifinal Nacional 2: Nordeste × Centro-Norte',
                timeClassificado1Id: campeoesNordeste.timeVencedorId,
                timeClassificado2Id: campeoesCentroNorte.timeVencedorId,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 semana
                status: 'AGENDADO'
            }
        })

        res.status(201).json({
            message: 'Semifinais nacionais geradas!',
            semifinal1,
            semifinal2
        })
    } catch (error) {
        console.error('Erro ao gerar semifinais nacionais:', error)
        res.status(500).json({ error: 'Erro ao gerar semifinais nacionais' })
    }
})

// POST /campeonatos/:id/gerar-final-nacional
superligaRouter.post('/campeonatos/:id/gerar-final-nacional', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        // Buscar vencedores das semifinais nacionais
        const semifinais = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId,
                fase: 'SEMIFINAL_NACIONAL',
                status: 'FINALIZADO'
            },
            include: { timeVencedor: true },
            orderBy: { rodada: 'asc' }
        })

        if (semifinais.length !== 2 || !semifinais[0].timeVencedor || !semifinais[1].timeVencedor) {
            res.status(400).json({ 
                error: 'Ambas as semifinais nacionais precisam estar finalizadas' 
            })
            return
        }

        // Criar final nacional
        const finalNacional = await prisma.playoffJogo.create({
            data: {
                campeonatoId,
                fase: 'FINAL_NACIONAL',
                rodada: 1,
                nome: 'Grande Decisão Nacional',
                timeClassificado1Id: semifinais[0].timeVencedorId,
                timeClassificado2Id: semifinais[1].timeVencedorId,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 semanas
                status: 'AGENDADO'
            }
        })

        res.status(201).json({
            message: 'Grande Decisão Nacional gerada!',
            finalNacional
        })
    } catch (error) {
        console.error('Erro ao gerar final nacional:', error)
        res.status(500).json({ error: 'Erro ao gerar final nacional' })
    }
})

// GET /campeonatos/:id/final-nacional
superligaRouter.get('/campeonatos/:id/final-nacional', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        const finalNacional = await prisma.playoffJogo.findFirst({
            where: {
                campeonatoId,
                fase: 'FINAL_NACIONAL'
            },
            include: {
                timeClassificado1: {
                    select: { id: true, nome: true, sigla: true, logo: true, cor: true }
                },
                timeClassificado2: {
                    select: { id: true, nome: true, sigla: true, logo: true, cor: true }
                },
                timeVencedor: {
                    select: { id: true, nome: true, sigla: true, logo: true, cor: true }
                }
            }
        })

        if (!finalNacional) {
            res.status(404).json({ error: 'Final nacional não encontrada' })
            return
        }

        res.status(200).json(finalNacional)
    } catch (error) {
        console.error('Erro ao buscar final nacional:', error)
        res.status(500).json({ error: 'Erro ao buscar final nacional' })
    }
})

// ==================== RESULTADOS E ATUALIZAÇÕES ====================

// PUT /playoff-jogos/:id/resultado
superligaRouter.put('/playoff-jogos/:id/resultado', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { placarTime1, placarTime2 } = req.body

        if (typeof placarTime1 !== 'number' || typeof placarTime2 !== 'number') {
            res.status(400).json({ error: 'Placares devem ser números' })
            return
        }

        const timeVencedorId = placarTime1 > placarTime2 ? 
            await prisma.playoffJogo.findUnique({ where: { id: parseInt(id) } }).then(j => j?.timeClassificado1Id) :
            await prisma.playoffJogo.findUnique({ where: { id: parseInt(id) } }).then(j => j?.timeClassificado2Id)

        const jogoAtualizado = await prisma.playoffJogo.update({
            where: { id: parseInt(id) },
            data: {
                placarTime1,
                placarTime2,
                timeVencedorId,
                status: 'FINALIZADO'
            },
            include: {
                timeClassificado1: true,
                timeClassificado2: true,
                timeVencedor: true
            }
        })

        res.status(200).json({
            message: 'Resultado atualizado com sucesso!',
            jogo: jogoAtualizado
        })
    } catch (error) {
        console.error('Erro ao atualizar resultado:', error)
        res.status(500).json({ error: 'Erro ao atualizar resultado do playoff' })
    }
})

// POST /campeonatos/:id/resetar-playoffs
superligaRouter.post('/campeonatos/:id/resetar-playoffs', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const campeonatoId = parseInt(id)

        await prisma.playoffJogo.deleteMany({
            where: { campeonatoId }
        })

        res.status(200).json({
            message: 'Playoffs resetados com sucesso!'
        })
    } catch (error) {
        console.error('Erro ao resetar playoffs:', error)
        res.status(500).json({ error: 'Erro ao resetar playoffs' })
    }
})

export default superligaRouter