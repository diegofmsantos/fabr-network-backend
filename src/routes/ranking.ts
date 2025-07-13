import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const rankingRouter = Router()

interface EstatisticaConsolidada {
    jogadorId: number
    timeId: number
    jogador: {
        id: number
        nome: string
        posicao: string
        setor: string
        idade: number
        altura: number
        peso: number
    }
    time: {
        id: number
        nome: string
        sigla: string
        cor: string
        logo: string
    }
    estatisticas: {
        passe: {
            jardas_de_passe: number
            passes_completos: number
            passes_tentados: number
            td_passados: number
            interceptacoes_sofridas: number
            sacks_sofridos: number
            fumble_de_passador: number
        }
        corrida: {
            jardas_corridas: number
            corridas: number
            tds_corridos: number
            fumble_de_corredor: number
        }
        recepcao: {
            jardas_recebidas: number
            recepcoes: number
            alvo: number
            tds_recebidos: number
        }
        defesa: {
            tackles_totais: number
            tackles_for_loss: number
            sacks_forcado: number
            fumble_forcado: number
            interceptacao_forcada: number
            passe_desviado: number
            safety: number
            td_defensivo: number
        }
        retorno: {
            retornos: number
            jardas_retornadas: number
            td_retornados: number
        }
        kicker: {
            xp_bons: number
            tentativas_de_xp: number
            fg_bons: number
            tentativas_de_fg: number
            fg_mais_longo: number
        }
        punter: {
            punts: number
            jardas_de_punt: number
        }
    }
}

rankingRouter.get('/:categoria', async (req: Request, res: Response) => {
    try {
        const { categoria } = req.params
        const { temporada = '2025', limite = '50' } = req.query

        console.log(`🎯 Buscando ranking para: ${categoria}, temporada: ${temporada}`)

        const estatisticas = await prisma.estatisticaJogo.findMany({
            where: { temporada: temporada as string },
            include: {
                jogador: {
                    select: {
                        id: true,
                        nome: true,
                        posicao: true,
                        setor: true,
                        idade: true,
                        altura: true,
                        peso: true
                    }
                },
                time: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        cor: true,
                        logo: true
                    }
                }
            }
        })

        console.log(`📊 Encontradas ${estatisticas.length} estatísticas`)

        const jogadoresMap = new Map<string, EstatisticaConsolidada>()

        estatisticas.forEach(est => {
            const key = `${est.jogadorId}-${est.timeId}`
            const stats = est.estatisticas as any

            if (!jogadoresMap.has(key)) {
                jogadoresMap.set(key, {
                    jogadorId: est.jogadorId,
                    timeId: est.timeId,
                    jogador: est.jogador,
                    time: est.time,
                    estatisticas: {
                        passe: {
                            jardas_de_passe: 0,
                            passes_completos: 0,
                            passes_tentados: 0,
                            td_passados: 0,
                            interceptacoes_sofridas: 0,
                            sacks_sofridos: 0,
                            fumble_de_passador: 0
                        },
                        corrida: {
                            jardas_corridas: 0,
                            corridas: 0,
                            tds_corridos: 0,
                            fumble_de_corredor: 0
                        },
                        recepcao: {
                            jardas_recebidas: 0,
                            recepcoes: 0,
                            alvo: 0,
                            tds_recebidos: 0
                        },
                        defesa: {
                            tackles_totais: 0,
                            tackles_for_loss: 0,
                            sacks_forcado: 0,
                            fumble_forcado: 0,
                            interceptacao_forcada: 0,
                            passe_desviado: 0,
                            safety: 0,
                            td_defensivo: 0
                        },
                        retorno: {
                            retornos: 0,
                            jardas_retornadas: 0,
                            td_retornados: 0
                        },
                        kicker: {
                            xp_bons: 0,
                            tentativas_de_xp: 0,
                            fg_bons: 0,
                            tentativas_de_fg: 0,
                            fg_mais_longo: 0
                        },
                        punter: {
                            punts: 0,
                            jardas_de_punt: 0
                        }
                    }
                })
            }

            const jogadorData = jogadoresMap.get(key)!

            if (stats.passe) {
                jogadorData.estatisticas.passe.jardas_de_passe += stats.passe.jardas_de_passe || 0
                jogadorData.estatisticas.passe.passes_completos += stats.passe.passes_completos || 0
                jogadorData.estatisticas.passe.passes_tentados += stats.passe.passes_tentados || 0
                jogadorData.estatisticas.passe.td_passados += stats.passe.td_passados || 0
                jogadorData.estatisticas.passe.interceptacoes_sofridas += stats.passe.interceptacoes_sofridas || 0
                jogadorData.estatisticas.passe.sacks_sofridos += stats.passe.sacks_sofridos || 0
                jogadorData.estatisticas.passe.fumble_de_passador += stats.passe.fumble_de_passador || 0
            }

            if (stats.corrida) {
                jogadorData.estatisticas.corrida.jardas_corridas += stats.corrida.jardas_corridas || 0
                jogadorData.estatisticas.corrida.corridas += stats.corrida.corridas || 0
                jogadorData.estatisticas.corrida.tds_corridos += stats.corrida.tds_corridos || 0
                jogadorData.estatisticas.corrida.fumble_de_corredor += stats.corrida.fumble_de_corredor || 0
            }

            if (stats.recepcao) {
                jogadorData.estatisticas.recepcao.jardas_recebidas += stats.recepcao.jardas_recebidas || 0
                jogadorData.estatisticas.recepcao.recepcoes += stats.recepcao.recepcoes || 0
                jogadorData.estatisticas.recepcao.alvo += stats.recepcao.alvo || 0
                jogadorData.estatisticas.recepcao.tds_recebidos += stats.recepcao.tds_recebidos || 0
            }

            if (stats.defesa) {
                jogadorData.estatisticas.defesa.tackles_totais += stats.defesa.tackles_totais || 0
                jogadorData.estatisticas.defesa.tackles_for_loss += stats.defesa.tackles_for_loss || 0
                jogadorData.estatisticas.defesa.sacks_forcado += stats.defesa.sacks_forcado || 0
                jogadorData.estatisticas.defesa.fumble_forcado += stats.defesa.fumble_forcado || 0
                jogadorData.estatisticas.defesa.interceptacao_forcada += stats.defesa.interceptacao_forcada || 0
                jogadorData.estatisticas.defesa.passe_desviado += stats.defesa.passe_desviado || 0
                jogadorData.estatisticas.defesa.safety += stats.defesa.safety || 0
                jogadorData.estatisticas.defesa.td_defensivo += stats.defesa.td_defensivo || 0
            }

            if (stats.retorno) {
                jogadorData.estatisticas.retorno.retornos += stats.retorno.retornos || 0
                jogadorData.estatisticas.retorno.jardas_retornadas += stats.retorno.jardas_retornadas || 0
                jogadorData.estatisticas.retorno.td_retornados += stats.retorno.td_retornados || 0
            }

            if (stats.kicker) {
                jogadorData.estatisticas.kicker.xp_bons += stats.kicker.xp_bons || 0
                jogadorData.estatisticas.kicker.tentativas_de_xp += stats.kicker.tentativas_de_xp || 0
                jogadorData.estatisticas.kicker.fg_bons += stats.kicker.fg_bons || 0
                jogadorData.estatisticas.kicker.tentativas_de_fg += stats.kicker.tentativas_de_fg || 0

                if ((stats.kicker.fg_mais_longo || 0) > jogadorData.estatisticas.kicker.fg_mais_longo) {
                    jogadorData.estatisticas.kicker.fg_mais_longo = stats.kicker.fg_mais_longo || 0
                }
            }

            if (stats.punter) {
                jogadorData.estatisticas.punter.punts += stats.punter.punts || 0
                jogadorData.estatisticas.punter.jardas_de_punt += stats.punter.jardas_de_punt || 0
            }
        })

        const jogadoresArray = Array.from(jogadoresMap.values())

        let ranking: EstatisticaConsolidada[] = []

        switch (categoria) {
            case 'jardas_de_passe':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.jardas_de_passe > 0)
                    .sort((a, b) => b.estatisticas.passe.jardas_de_passe - a.estatisticas.passe.jardas_de_passe)
                break
            case 'td_passados':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.td_passados > 0)
                    .sort((a, b) => b.estatisticas.passe.td_passados - a.estatisticas.passe.td_passados)
                break
            case 'passes_completos':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.passes_completos > 0)
                    .sort((a, b) => b.estatisticas.passe.passes_completos - a.estatisticas.passe.passes_completos)
                break
            case 'passes_tentados':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.passes_tentados > 0)
                    .sort((a, b) => b.estatisticas.passe.passes_tentados - a.estatisticas.passe.passes_tentados)
                break
            case 'interceptacoes_sofridas':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.interceptacoes_sofridas > 0)
                    .sort((a, b) => a.estatisticas.passe.interceptacoes_sofridas - b.estatisticas.passe.interceptacoes_sofridas) 
                break
            case 'sacks_sofridos':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.sacks_sofridos > 0)
                    .sort((a, b) => a.estatisticas.passe.sacks_sofridos - b.estatisticas.passe.sacks_sofridos) 
                break
            case 'fumble_de_passador':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.fumble_de_passador > 0)
                    .sort((a, b) => a.estatisticas.passe.fumble_de_passador - b.estatisticas.passe.fumble_de_passador) 
                break
            case 'passes_percentual':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.passes_tentados >= 10) 
                    .map(j => ({
                        ...j,
                        percentual: (j.estatisticas.passe.passes_completos / j.estatisticas.passe.passes_tentados) * 100
                    }))
                    .sort((a: any, b: any) => b.percentual - a.percentual)
                break
            case 'jardas_media':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.passes_tentados >= 10) 
                    .map(j => ({
                        ...j,
                        media: j.estatisticas.passe.jardas_de_passe / j.estatisticas.passe.passes_tentados
                    }))
                    .sort((a: any, b: any) => b.media - a.media)
                break

            case 'jardas_corridas':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.corrida.jardas_corridas > 0)
                    .sort((a, b) => b.estatisticas.corrida.jardas_corridas - a.estatisticas.corrida.jardas_corridas)
                break
            case 'tds_corridos':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.corrida.tds_corridos > 0)
                    .sort((a, b) => b.estatisticas.corrida.tds_corridos - a.estatisticas.corrida.tds_corridos)
                break
            case 'corridas':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.corrida.corridas > 0)
                    .sort((a, b) => b.estatisticas.corrida.corridas - a.estatisticas.corrida.corridas)
                break
            case 'fumble_de_corredor':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.corrida.fumble_de_corredor > 0)
                    .sort((a, b) => a.estatisticas.corrida.fumble_de_corredor - b.estatisticas.corrida.fumble_de_corredor) 
                break
            case 'jardas_corridas_media':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.corrida.corridas >= 5) 
                    .map(j => ({
                        ...j,
                        media: j.estatisticas.corrida.jardas_corridas / j.estatisticas.corrida.corridas
                    }))
                    .sort((a: any, b: any) => b.media - a.media)
                break

            case 'jardas_recebidas':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.recepcao.jardas_recebidas > 0)
                    .sort((a, b) => b.estatisticas.recepcao.jardas_recebidas - a.estatisticas.recepcao.jardas_recebidas)
                break
            case 'recepcoes':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.recepcao.recepcoes > 0)
                    .sort((a, b) => b.estatisticas.recepcao.recepcoes - a.estatisticas.recepcao.recepcoes)
                break
            case 'tds_recebidos':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.recepcao.tds_recebidos > 0)
                    .sort((a, b) => b.estatisticas.recepcao.tds_recebidos - a.estatisticas.recepcao.tds_recebidos)
                break
            case 'alvo':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.recepcao.alvo > 0)
                    .sort((a, b) => b.estatisticas.recepcao.alvo - a.estatisticas.recepcao.alvo)
                break
            case 'jardas_recebidas_media':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.recepcao.recepcoes >= 3) 
                    .map(j => ({
                        ...j,
                        media: j.estatisticas.recepcao.jardas_recebidas / j.estatisticas.recepcao.recepcoes
                    }))
                    .sort((a: any, b: any) => b.media - a.media)
                break

            case 'jardas_retornadas':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.retorno.jardas_retornadas > 0)
                    .sort((a, b) => b.estatisticas.retorno.jardas_retornadas - a.estatisticas.retorno.jardas_retornadas)
                break
            case 'retornos':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.retorno.retornos > 0)
                    .sort((a, b) => b.estatisticas.retorno.retornos - a.estatisticas.retorno.retornos)
                break
            case 'td_retornados':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.retorno.td_retornados > 0)
                    .sort((a, b) => b.estatisticas.retorno.td_retornados - a.estatisticas.retorno.td_retornados)
                break
            case 'jardas_retornadas_media':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.retorno.retornos >= 3) 
                    .map(j => ({
                        ...j,
                        media: j.estatisticas.retorno.jardas_retornadas / j.estatisticas.retorno.retornos
                    }))
                    .sort((a: any, b: any) => b.media - a.media)
                break

            case 'tackles_totais':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.tackles_totais > 0)
                    .sort((a, b) => b.estatisticas.defesa.tackles_totais - a.estatisticas.defesa.tackles_totais)
                break
            case 'tackles_for_loss':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.tackles_for_loss > 0)
                    .sort((a, b) => b.estatisticas.defesa.tackles_for_loss - a.estatisticas.defesa.tackles_for_loss)
                break
            case 'sacks_forcado':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.sacks_forcado > 0)
                    .sort((a, b) => b.estatisticas.defesa.sacks_forcado - a.estatisticas.defesa.sacks_forcado)
                break
            case 'fumble_forcado':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.fumble_forcado > 0)
                    .sort((a, b) => b.estatisticas.defesa.fumble_forcado - a.estatisticas.defesa.fumble_forcado)
                break
            case 'interceptacao_forcada':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.interceptacao_forcada > 0)
                    .sort((a, b) => b.estatisticas.defesa.interceptacao_forcada - a.estatisticas.defesa.interceptacao_forcada)
                break
            case 'passe_desviado':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.passe_desviado > 0)
                    .sort((a, b) => b.estatisticas.defesa.passe_desviado - a.estatisticas.defesa.passe_desviado)
                break
            case 'safety':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.safety > 0)
                    .sort((a, b) => b.estatisticas.defesa.safety - a.estatisticas.defesa.safety)
                break
            case 'td_defensivo':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.defesa.td_defensivo > 0)
                    .sort((a, b) => b.estatisticas.defesa.td_defensivo - a.estatisticas.defesa.td_defensivo)
                break

            case 'fg_bons':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.fg_bons > 0)
                    .sort((a, b) => b.estatisticas.kicker.fg_bons - a.estatisticas.kicker.fg_bons)
                break
            case 'tentativas_de_fg':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.tentativas_de_fg > 0)
                    .sort((a, b) => b.estatisticas.kicker.tentativas_de_fg - a.estatisticas.kicker.tentativas_de_fg)
                break
            case 'fg_mais_longo':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.fg_mais_longo > 0)
                    .sort((a, b) => b.estatisticas.kicker.fg_mais_longo - a.estatisticas.kicker.fg_mais_longo)
                break
            case 'xp_bons':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.xp_bons > 0)
                    .sort((a, b) => b.estatisticas.kicker.xp_bons - a.estatisticas.kicker.xp_bons)
                break
            case 'tentativas_de_xp':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.tentativas_de_xp > 0)
                    .sort((a, b) => b.estatisticas.kicker.tentativas_de_xp - a.estatisticas.kicker.tentativas_de_xp)
                break
            case 'field_goals':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.tentativas_de_fg >= 3) 
                    .map(j => ({
                        ...j,
                        percentual: (j.estatisticas.kicker.fg_bons / j.estatisticas.kicker.tentativas_de_fg) * 100
                    }))
                    .sort((a: any, b: any) => b.percentual - a.percentual)
                break
            case 'extra_points':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.kicker.tentativas_de_xp >= 3) 
                    .map(j => ({
                        ...j,
                        percentual: (j.estatisticas.kicker.xp_bons / j.estatisticas.kicker.tentativas_de_xp) * 100
                    }))
                    .sort((a: any, b: any) => b.percentual - a.percentual)
                break

            case 'punts':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.punter.punts > 0)
                    .sort((a, b) => b.estatisticas.punter.punts - a.estatisticas.punter.punts)
                break
            case 'jardas_de_punt':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.punter.jardas_de_punt > 0)
                    .sort((a, b) => b.estatisticas.punter.jardas_de_punt - a.estatisticas.punter.jardas_de_punt)
                break
            case 'jardas_punt_media':
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.punter.punts >= 3) 
                    .map(j => ({
                        ...j,
                        media: j.estatisticas.punter.jardas_de_punt / j.estatisticas.punter.punts
                    }))
                    .sort((a: any, b: any) => b.media - a.media)
                break

            default:
                console.log(`⚠️  Categoria não reconhecida: ${categoria}`)
                ranking = jogadoresArray
                    .filter(j => j.estatisticas.passe.jardas_de_passe > 0)
                    .sort((a, b) => b.estatisticas.passe.jardas_de_passe - a.estatisticas.passe.jardas_de_passe)
                    .slice(0, parseInt(limite as string) || 50)
        }

        const limitNumber = parseInt(limite as string) || 50
        const resultado = ranking.slice(0, limitNumber)

        console.log(`✅ Retornando ${resultado.length} jogadores para categoria: ${categoria}`)

        res.json(resultado)
    } catch (error) {
        console.error('❌ Erro ao buscar ranking:', error)
        res.status(500).json({
            error: 'Erro ao buscar ranking',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

rankingRouter.get('/times/:categoria', async (req: Request, res: Response) => {
    try {
        const { categoria } = req.params
        const { temporada = '2025' } = req.query

        res.json([])
    } catch (error) {
        console.error('Erro ao buscar ranking de times:', error)
        res.status(500).json({ error: 'Erro ao buscar ranking de times' })
    }
})

export { rankingRouter }