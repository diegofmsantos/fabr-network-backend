import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client';
import { cacheControlLeitura } from '../middleware/cache'


const prisma = new PrismaClient()
const rankingRouter = Router()

// Ranking é recalculado por importação de estatísticas — 60s de cache é seguro.
rankingRouter.use(cacheControlLeitura(60))

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
    totalJogos?: number
}

const CATEGORIA_FIELD_MAP: Record<string, { path: string, setor?: string, minimo?: number }> = {
    // Passe
    'jardas_de_passe': { path: 'passe.jardas_de_passe', setor: 'Ataque' },
    'td_passados': { path: 'passe.td_passados', setor: 'Ataque' },
    'passes_completos': { path: 'passe.passes_completos', setor: 'Ataque' },
    'passes_tentados': { path: 'passe.passes_tentados', setor: 'Ataque' },
    'interceptacoes_sofridas': { path: 'passe.interceptacoes_sofridas', setor: 'Ataque' },
    'sacks_sofridos': { path: 'passe.sacks_sofridos', setor: 'Ataque' },
    'fumble_de_passador': { path: 'passe.fumble_de_passador', setor: 'Ataque' },
    'passes_percentual': { path: 'passe.passes_completos', setor: 'Ataque', minimo: 10 },
    'jardas_media': { path: 'passe.jardas_de_passe', setor: 'Ataque', minimo: 10 },

    // Corrida
    'jardas_corridas': { path: 'corrida.jardas_corridas', setor: 'Ataque' },
    'tds_corridos': { path: 'corrida.tds_corridos', setor: 'Ataque' },
    'corridas': { path: 'corrida.corridas', setor: 'Ataque' },
    'fumble_de_corredor': { path: 'corrida.fumble_de_corredor', setor: 'Ataque' },
    'jardas_corridas_media': { path: 'corrida.jardas_corridas', setor: 'Ataque', minimo: 5 },

    // Recepção
    'jardas_recebidas': { path: 'recepcao.jardas_recebidas', setor: 'Ataque' },
    'recepcoes': { path: 'recepcao.recepcoes', setor: 'Ataque' },
    'tds_recebidos': { path: 'recepcao.tds_recebidos', setor: 'Ataque' },
    'alvo': { path: 'recepcao.alvo', setor: 'Ataque' },
    'jardas_recebidas_media': { path: 'recepcao.jardas_recebidas', setor: 'Ataque', minimo: 3 },

    // Retorno
    'jardas_retornadas': { path: 'retorno.jardas_retornadas', setor: 'Special' },
    'retornos': { path: 'retorno.retornos', setor: 'Special' },
    'td_retornados': { path: 'retorno.td_retornados', setor: 'Special' },
    'jardas_retornadas_media': { path: 'retorno.jardas_retornadas', setor: 'Special', minimo: 3 },

    // Defesa
    'tackles_totais': { path: 'defesa.tackles_totais', setor: 'Defesa' },
    'tackles_for_loss': { path: 'defesa.tackles_for_loss', setor: 'Defesa' },
    'sacks_forcado': { path: 'defesa.sacks_forcado', setor: 'Defesa' },
    'fumble_forcado': { path: 'defesa.fumble_forcado', setor: 'Defesa' },
    'interceptacao_forcada': { path: 'defesa.interceptacao_forcada', setor: 'Defesa' },
    'passe_desviado': { path: 'defesa.passe_desviado', setor: 'Defesa' },
    'safety': { path: 'defesa.safety', setor: 'Defesa' },
    'td_defensivo': { path: 'defesa.td_defensivo', setor: 'Defesa' },

    // Kicker
    'fg_bons': { path: 'kicker.fg_bons', setor: 'Special' },
    'tentativas_de_fg': { path: 'kicker.tentativas_de_fg', setor: 'Special' },
    'fg_mais_longo': { path: 'kicker.fg_mais_longo', setor: 'Special' },
    'xp_bons': { path: 'kicker.xp_bons', setor: 'Special' },
    'tentativas_de_xp': { path: 'kicker.tentativas_de_xp', setor: 'Special' },
    'field_goals': { path: 'kicker.fg_bons', setor: 'Special', minimo: 3 },
    'extra_points': { path: 'kicker.xp_bons', setor: 'Special', minimo: 3 },

    // Punter
    'punts': { path: 'punter.punts', setor: 'Special' },
    'jardas_de_punt': { path: 'punter.jardas_de_punt', setor: 'Special' },
    'jardas_punt_media': { path: 'punter.punts', setor: 'Special', minimo: 3 },
}

async function buscarRankingOtimizado(
    categoria: string,
    temporada: string,
    limite: number,
    fase?: string
): Promise<EstatisticaConsolidada[]> {

    const config = CATEGORIA_FIELD_MAP[categoria]
    if (!config) {
        console.log(`⚠️ Categoria ${categoria} não mapeada, usando fallback`)
        return buscarRankingFallback(temporada, limite)
    }

    const [mainField, subField] = config.path.split('.')

    const whereClause: any = {
        temporada: temporada,
        NOT: {
            estatisticas: {
                path: [mainField, subField],
                equals: Prisma.JsonNull
            }
        }
    }

    if (fase) {
        whereClause.fase = fase
        console.log(`🎯 [RANKING] Filtrando por fase: ${fase}`)
    }

    console.log(`🔍 [OTIMIZADO] Buscando: ${categoria} (${config.path})`)

    const estatisticas = await prisma.estatisticaJogo.findMany({
        where: whereClause,
        select: {
            jogadorId: true,
            timeId: true,
            estatisticas: true
        }
    })

    console.log(`📊 Estatísticas encontradas: ${estatisticas.length}`)

    const jogadoresMap = new Map<number, any>()

    estatisticas.forEach(est => {
        const jogadorId = est.jogadorId
        const stats = est.estatisticas as any

        if (!jogadoresMap.has(jogadorId)) {
            jogadoresMap.set(jogadorId, {
                jogadorId: jogadorId,
                timeId: est.timeId,
                stats: {
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
                },
                totalJogos: 0
            })
        }

        const jogadorData = jogadoresMap.get(jogadorId)!

        jogadorData.totalJogos++

        if (stats.passe) {
            jogadorData.stats.passe.jardas_de_passe += stats.passe.jardas_de_passe || 0
            jogadorData.stats.passe.passes_completos += stats.passe.passes_completos || 0
            jogadorData.stats.passe.passes_tentados += stats.passe.passes_tentados || 0
            jogadorData.stats.passe.td_passados += stats.passe.td_passados || 0
            jogadorData.stats.passe.interceptacoes_sofridas += stats.passe.interceptacoes_sofridas || 0
            jogadorData.stats.passe.sacks_sofridos += stats.passe.sacks_sofridos || 0
            jogadorData.stats.passe.fumble_de_passador += stats.passe.fumble_de_passador || 0
        }

        if (stats.corrida) {
            jogadorData.stats.corrida.jardas_corridas += stats.corrida.jardas_corridas || 0
            jogadorData.stats.corrida.corridas += stats.corrida.corridas || 0
            jogadorData.stats.corrida.tds_corridos += stats.corrida.tds_corridos || 0
            jogadorData.stats.corrida.fumble_de_corredor += stats.corrida.fumble_de_corredor || 0
        }

        if (stats.recepcao) {
            jogadorData.stats.recepcao.jardas_recebidas += stats.recepcao.jardas_recebidas || 0
            jogadorData.stats.recepcao.recepcoes += stats.recepcao.recepcoes || 0
            jogadorData.stats.recepcao.alvo += stats.recepcao.alvo || 0
            jogadorData.stats.recepcao.tds_recebidos += stats.recepcao.tds_recebidos || 0
        }

        if (stats.defesa) {
            jogadorData.stats.defesa.tackles_totais += stats.defesa.tackles_totais || 0
            jogadorData.stats.defesa.tackles_for_loss += stats.defesa.tackles_for_loss || 0
            jogadorData.stats.defesa.sacks_forcado += stats.defesa.sacks_forcado || 0
            jogadorData.stats.defesa.fumble_forcado += stats.defesa.fumble_forcado || 0
            jogadorData.stats.defesa.interceptacao_forcada += stats.defesa.interceptacao_forcada || 0
            jogadorData.stats.defesa.passe_desviado += stats.defesa.passe_desviado || 0
            jogadorData.stats.defesa.safety += stats.defesa.safety || 0
            jogadorData.stats.defesa.td_defensivo += stats.defesa.td_defensivo || 0
        }

        if (stats.retorno) {
            jogadorData.stats.retorno.retornos += stats.retorno.retornos || 0
            jogadorData.stats.retorno.jardas_retornadas += stats.retorno.jardas_retornadas || 0
            jogadorData.stats.retorno.td_retornados += stats.retorno.td_retornados || 0
        }

        if (stats.kicker) {
            jogadorData.stats.kicker.xp_bons += stats.kicker.xp_bons || 0
            jogadorData.stats.kicker.tentativas_de_xp += stats.kicker.tentativas_de_xp || 0
            jogadorData.stats.kicker.fg_bons += stats.kicker.fg_bons || 0
            jogadorData.stats.kicker.tentativas_de_fg += stats.kicker.tentativas_de_fg || 0

            if ((stats.kicker.fg_mais_longo || 0) > jogadorData.stats.kicker.fg_mais_longo) {
                jogadorData.stats.kicker.fg_mais_longo = stats.kicker.fg_mais_longo || 0
            }
        }

        if (stats.punter) {
            jogadorData.stats.punter.punts += stats.punter.punts || 0
            jogadorData.stats.punter.jardas_de_punt += stats.punter.jardas_de_punt || 0
        }
    })

    // Após consolidar as estatísticas no Map

    const jogadorIds = Array.from(jogadoresMap.keys())
    const timeIds = [...new Set(Array.from(jogadoresMap.values()).map(j => j.timeId))]

    console.log(`👥 Buscando dados de ${jogadorIds.length} jogadores e ${timeIds.length} times`)

    // 👇 BUSCAR JOGADORES E TIMES DE UMA VEZ
    const [jogadores, times] = await Promise.all([
        prisma.jogador.findMany({
            where: {
                id: { in: jogadorIds },
                ...(config.setor ? { setor: config.setor } : {})
            },
            select: {
                id: true,
                nome: true,
                posicao: true,
                setor: true,
                idade: true,
                altura: true,
                peso: true
            }
        }),
        prisma.time.findMany({
            where: { id: { in: timeIds } },
            select: {
                id: true,
                nome: true,
                sigla: true,
                cor: true,
                logo: true
            }
        })
    ])

    // 👇 CRIAR LOOKUP MAPS PARA BUSCA RÁPIDA
    const jogadoresLookup = new Map(jogadores.map(j => [j.id, j]))
    const timesLookup = new Map(times.map(t => [t.id, t]))

    // 👇 MONTAR RESULTADO FINAL COM totalJogos
    const resultado: EstatisticaConsolidada[] = []

    for (const jogadorData of jogadoresMap.values()) {
        const jogador = jogadoresLookup.get(jogadorData.jogadorId)
        const time = timesLookup.get(jogadorData.timeId)

        if (!jogador || !time) continue

        resultado.push({
            jogadorId: jogadorData.jogadorId,
            timeId: jogadorData.timeId,
            jogador: {
                id: jogador.id,
                nome: jogador.nome,
                posicao: jogador.posicao || 'N/A',
                setor: jogador.setor || 'N/A',
                idade: jogador.idade || 0,
                altura: jogador.altura || 0,
                peso: jogador.peso || 0
            },
            time: {
                id: time.id,
                nome: time.nome,
                sigla: time.sigla,
                cor: time.cor,
                logo: time.logo
            },
            estatisticas: jogadorData.stats,
            totalJogos: jogadorData.totalJogos // 👈 ADICIONAR AQUI
        })
    }

    // 👇 APLICAR ORDENAÇÃO E RETORNAR
    let rankingFinal = aplicarOrdenacaoCategoria(resultado, categoria)

    console.timeEnd(`ranking-${categoria}`)
    console.log(`✅ Retornando ${rankingFinal.length} jogadores (limitado a ${limite})`)

    return rankingFinal.slice(0, limite)
}

function aplicarOrdenacaoCategoria(
    jogadores: EstatisticaConsolidada[],
    categoria: string
): EstatisticaConsolidada[] {

    let ranking: any[] = jogadores

    switch (categoria) {
        // Passe
        case 'jardas_de_passe':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.jardas_de_passe > 0)
                .sort((a, b) => b.estatisticas.passe.jardas_de_passe - a.estatisticas.passe.jardas_de_passe)
            break
        case 'td_passados':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.td_passados > 0)
                .sort((a, b) => b.estatisticas.passe.td_passados - a.estatisticas.passe.td_passados)
            break
        case 'passes_completos':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.passes_completos > 0)
                .sort((a, b) => b.estatisticas.passe.passes_completos - a.estatisticas.passe.passes_completos)
            break
        case 'passes_tentados':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.passes_tentados > 0)
                .sort((a, b) => b.estatisticas.passe.passes_tentados - a.estatisticas.passe.passes_tentados)
            break
        case 'interceptacoes_sofridas':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.interceptacoes_sofridas > 0)
                .sort((a, b) => a.estatisticas.passe.interceptacoes_sofridas - b.estatisticas.passe.interceptacoes_sofridas)
            break
        case 'sacks_sofridos':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.sacks_sofridos > 0)
                .sort((a, b) => a.estatisticas.passe.sacks_sofridos - b.estatisticas.passe.sacks_sofridos)
            break
        case 'fumble_de_passador':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.fumble_de_passador > 0)
                .sort((a, b) => a.estatisticas.passe.fumble_de_passador - b.estatisticas.passe.fumble_de_passador)
            break
        case 'passes_percentual':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.passes_tentados >= 10)
                .map(j => ({
                    ...j,
                    percentual: (j.estatisticas.passe.passes_completos / j.estatisticas.passe.passes_tentados) * 100
                }))
                .sort((a: any, b: any) => b.percentual - a.percentual)
            break
        case 'jardas_media':
            ranking = jogadores
                .filter(j => j.estatisticas.passe.passes_tentados >= 10)
                .map(j => ({
                    ...j,
                    media: j.estatisticas.passe.jardas_de_passe / j.estatisticas.passe.passes_tentados
                }))
                .sort((a: any, b: any) => b.media - a.media)
            break

        // Corrida
        case 'jardas_corridas':
            ranking = jogadores
                .filter(j => j.estatisticas.corrida.jardas_corridas > 0)
                .sort((a, b) => b.estatisticas.corrida.jardas_corridas - a.estatisticas.corrida.jardas_corridas)
            break
        case 'tds_corridos':
            ranking = jogadores
                .filter(j => j.estatisticas.corrida.tds_corridos > 0)
                .sort((a, b) => b.estatisticas.corrida.tds_corridos - a.estatisticas.corrida.tds_corridos)
            break
        case 'corridas':
            ranking = jogadores
                .filter(j => j.estatisticas.corrida.corridas > 0)
                .sort((a, b) => b.estatisticas.corrida.corridas - a.estatisticas.corrida.corridas)
            break
        case 'fumble_de_corredor':
            ranking = jogadores
                .filter(j => j.estatisticas.corrida.fumble_de_corredor > 0)
                .sort((a, b) => a.estatisticas.corrida.fumble_de_corredor - b.estatisticas.corrida.fumble_de_corredor)
            break
        case 'jardas_corridas_media':
            ranking = jogadores
                .filter(j => j.estatisticas.corrida.corridas >= 5)
                .map(j => ({
                    ...j,
                    media: j.estatisticas.corrida.jardas_corridas / j.estatisticas.corrida.corridas
                }))
                .sort((a: any, b: any) => b.media - a.media)
            break

        // Recepção
        case 'jardas_recebidas':
            ranking = jogadores
                .filter(j => j.estatisticas.recepcao.jardas_recebidas > 0)
                .sort((a, b) => b.estatisticas.recepcao.jardas_recebidas - a.estatisticas.recepcao.jardas_recebidas)
            break
        case 'recepcoes':
            ranking = jogadores
                .filter(j => j.estatisticas.recepcao.recepcoes > 0)
                .sort((a, b) => b.estatisticas.recepcao.recepcoes - a.estatisticas.recepcao.recepcoes)
            break
        case 'tds_recebidos':
            ranking = jogadores
                .filter(j => j.estatisticas.recepcao.tds_recebidos > 0)
                .sort((a, b) => b.estatisticas.recepcao.tds_recebidos - a.estatisticas.recepcao.tds_recebidos)
            break
        case 'alvo':
            ranking = jogadores
                .filter(j => j.estatisticas.recepcao.alvo > 0)
                .sort((a, b) => b.estatisticas.recepcao.alvo - a.estatisticas.recepcao.alvo)
            break
        case 'jardas_recebidas_media':
            ranking = jogadores
                .filter(j => j.estatisticas.recepcao.recepcoes >= 3)
                .map(j => ({
                    ...j,
                    media: j.estatisticas.recepcao.jardas_recebidas / j.estatisticas.recepcao.recepcoes
                }))
                .sort((a: any, b: any) => b.media - a.media)
            break

        // Retorno
        case 'jardas_retornadas':
            ranking = jogadores
                .filter(j => j.estatisticas.retorno.jardas_retornadas > 0)
                .sort((a, b) => b.estatisticas.retorno.jardas_retornadas - a.estatisticas.retorno.jardas_retornadas)
            break
        case 'retornos':
            ranking = jogadores
                .filter(j => j.estatisticas.retorno.retornos > 0)
                .sort((a, b) => b.estatisticas.retorno.retornos - a.estatisticas.retorno.retornos)
            break
        case 'td_retornados':
            ranking = jogadores
                .filter(j => j.estatisticas.retorno.td_retornados > 0)
                .sort((a, b) => b.estatisticas.retorno.td_retornados - a.estatisticas.retorno.td_retornados)
            break
        case 'jardas_retornadas_media':
            ranking = jogadores
                .filter(j => j.estatisticas.retorno.retornos >= 3)
                .map(j => ({
                    ...j,
                    media: j.estatisticas.retorno.jardas_retornadas / j.estatisticas.retorno.retornos
                }))
                .sort((a: any, b: any) => b.media - a.media)
            break

        // Defesa
        case 'tackles_totais':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.tackles_totais > 0)
                .sort((a, b) => b.estatisticas.defesa.tackles_totais - a.estatisticas.defesa.tackles_totais)
            break
        case 'tackles_for_loss':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.tackles_for_loss > 0)
                .sort((a, b) => b.estatisticas.defesa.tackles_for_loss - a.estatisticas.defesa.tackles_for_loss)
            break
        case 'sacks_forcado':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.sacks_forcado > 0)
                .sort((a, b) => b.estatisticas.defesa.sacks_forcado - a.estatisticas.defesa.sacks_forcado)
            break
        case 'fumble_forcado':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.fumble_forcado > 0)
                .sort((a, b) => b.estatisticas.defesa.fumble_forcado - a.estatisticas.defesa.fumble_forcado)
            break
        case 'interceptacao_forcada':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.interceptacao_forcada > 0)
                .sort((a, b) => b.estatisticas.defesa.interceptacao_forcada - a.estatisticas.defesa.interceptacao_forcada)
            break
        case 'passe_desviado':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.passe_desviado > 0)
                .sort((a, b) => b.estatisticas.defesa.passe_desviado - a.estatisticas.defesa.passe_desviado)
            break
        case 'safety':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.safety > 0)
                .sort((a, b) => b.estatisticas.defesa.safety - a.estatisticas.defesa.safety)
            break
        case 'td_defensivo':
            ranking = jogadores
                .filter(j => j.estatisticas.defesa.td_defensivo > 0)
                .sort((a, b) => b.estatisticas.defesa.td_defensivo - a.estatisticas.defesa.td_defensivo)
            break

        // Kicker
        case 'fg_bons':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.fg_bons > 0)
                .sort((a, b) => b.estatisticas.kicker.fg_bons - a.estatisticas.kicker.fg_bons)
            break
        case 'tentativas_de_fg':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.tentativas_de_fg > 0)
                .sort((a, b) => b.estatisticas.kicker.tentativas_de_fg - a.estatisticas.kicker.tentativas_de_fg)
            break
        case 'fg_mais_longo':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.fg_mais_longo > 0)
                .sort((a, b) => b.estatisticas.kicker.fg_mais_longo - a.estatisticas.kicker.fg_mais_longo)
            break
        case 'xp_bons':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.xp_bons > 0)
                .sort((a, b) => b.estatisticas.kicker.xp_bons - a.estatisticas.kicker.xp_bons)
            break
        case 'tentativas_de_xp':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.tentativas_de_xp > 0)
                .sort((a, b) => b.estatisticas.kicker.tentativas_de_xp - a.estatisticas.kicker.tentativas_de_xp)
            break
        case 'field_goals':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.tentativas_de_fg >= 3)
                .map(j => ({
                    ...j,
                    percentual: (j.estatisticas.kicker.fg_bons / j.estatisticas.kicker.tentativas_de_fg) * 100
                }))
                .sort((a: any, b: any) => b.percentual - a.percentual)
            break
        case 'extra_points':
            ranking = jogadores
                .filter(j => j.estatisticas.kicker.tentativas_de_xp >= 3)
                .map(j => ({
                    ...j,
                    percentual: (j.estatisticas.kicker.xp_bons / j.estatisticas.kicker.tentativas_de_xp) * 100
                }))
                .sort((a: any, b: any) => b.percentual - a.percentual)
            break

        // Punter
        case 'punts':
            ranking = jogadores
                .filter(j => j.estatisticas.punter.punts > 0)
                .sort((a, b) => b.estatisticas.punter.punts - a.estatisticas.punter.punts)
            break
        case 'jardas_de_punt':
            ranking = jogadores
                .filter(j => j.estatisticas.punter.jardas_de_punt > 0)
                .sort((a, b) => b.estatisticas.punter.jardas_de_punt - a.estatisticas.punter.jardas_de_punt)
            break
        case 'jardas_punt_media':
            ranking = jogadores
                .filter(j => j.estatisticas.punter.punts >= 3)
                .map(j => ({
                    ...j,
                    media: j.estatisticas.punter.jardas_de_punt / j.estatisticas.punter.punts
                }))
                .sort((a: any, b: any) => b.media - a.media)
            break

        default:
            console.log(`⚠️ Categoria não reconhecida: ${categoria}`)
            ranking = jogadores
                .filter(j => j.estatisticas.passe.jardas_de_passe > 0)
                .sort((a, b) => b.estatisticas.passe.jardas_de_passe - a.estatisticas.passe.jardas_de_passe)
    }

    return ranking
}

async function buscarRankingFallback(temporada: string, limite: number): Promise<EstatisticaConsolidada[]> {
    console.log('⚠️ Usando método fallback (menos otimizado)')

    const estatisticas = await prisma.estatisticaJogo.findMany({
        where: { temporada: temporada },
        select: {
            jogadorId: true,
            timeId: true,
            estatisticas: true,
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
        },
        take: limite * 10
    })

    const jogadoresMap = new Map<string, EstatisticaConsolidada>()

    return Array.from(jogadoresMap.values()).slice(0, limite)
}

rankingRouter.get('/:categoria', async (req: Request, res: Response) => {
    try {
        const { categoria } = req.params
        const { temporada = '2026', limite = '50' } = req.query

        console.log(`🎯 [OTIMIZADO] Buscando ranking para: ${categoria}, temporada: ${temporada}`)

        const limiteNum = parseInt(limite as string) || 50
        const resultado = await buscarRankingOtimizado(categoria, temporada as string, limiteNum)

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

rankingRouter.get('/temporada-regular/:categoria', async (req: Request, res: Response) => {
    try {
        const { categoria } = req.params
        const { temporada = '2026', limite = '50' } = req.query

        console.log(`🏈 Buscando ranking TEMPORADA REGULAR: ${categoria}`)

        const limiteNum = parseInt(limite as string) || 50

        const resultado = await buscarRankingOtimizado(
            categoria,
            temporada as string,
            limiteNum,
            'TEMPORADA REGULAR'
        )

        console.log(`✅ Retornando ${resultado.length} jogadores (apenas temporada regular)`)

        res.json(resultado)
    } catch (error) {
        console.error('❌ Erro ao buscar ranking temporada regular:', error)
        res.status(500).json({
            error: 'Erro ao buscar ranking temporada regular',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

rankingRouter.get('/times/:categoria', async (req: Request, res: Response) => {
    try {
        const { categoria } = req.params
        const { temporada = '2026' } = req.query

        res.json([])
    } catch (error) {
        console.error('Erro ao buscar ranking de times:', error)
        res.status(500).json({ error: 'Erro ao buscar ranking de times' })
    }
})



export { rankingRouter }