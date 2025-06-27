import { PrismaClient } from '@prisma/client'
import { SUPERLIGA_CONFIG, TIMES_SUPERLIGA, TipoConferencia, TipoRegional } from '../types'

const prisma = new PrismaClient()

export interface ValidacaoResult {
    valida: boolean
    erros: string[]
    avisos: string[]
    detalhes: {
        campeonato?: any
        conferencias?: any[]
        regionais?: any[]
        times?: any[]
        grupos?: any[]
    }
}

export interface ReparoResult {
    reparosRealizados: string[]
    errosNaoCorrigidos: string[]
    detalhes: any
}

export async function validarIntegridadeSuperliga(campeonatoId: number): Promise<ValidacaoResult> {
    const erros: string[] = []
    const avisos: string[] = []
    const detalhes: any = {}

    try {
        const campeonato = await prisma.campeonato.findUnique({
            where: { id: campeonatoId },
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                },
                _count: {
                    select: {
                        conferencias: true,
                        jogos: true
                    }
                }
            }
        })

        if (!campeonato) {
            erros.push(`Campeonato com ID ${campeonatoId} não encontrado`)
            return { valida: false, erros, avisos, detalhes }
        }

        if (!campeonato.isSuperliga) {
            erros.push('Campeonato não está marcado como Superliga')
        }

        detalhes.campeonato = campeonato

        const validacaoConferencias = await validarConferencias(campeonatoId, campeonato.conferencias)
        erros.push(...validacaoConferencias.erros)
        avisos.push(...validacaoConferencias.avisos)
        detalhes.conferencias = validacaoConferencias.conferencias

        const validacaoRegionais = await validarRegionais(campeonatoId)
        erros.push(...validacaoRegionais.erros)
        avisos.push(...validacaoRegionais.avisos)
        detalhes.regionais = validacaoRegionais.regionais

        const validacaoTimes = await validarDistribuicaoTimes(campeonatoId)
        erros.push(...validacaoTimes.erros)
        avisos.push(...validacaoTimes.avisos)
        detalhes.times = validacaoTimes.times
        detalhes.grupos = validacaoTimes.grupos

        const validacaoJogos = await validarJogos(campeonatoId)
        avisos.push(...validacaoJogos.avisos)

        return {
            valida: erros.length === 0,
            erros,
            avisos,
            detalhes
        }

    } catch (error) {
        console.error('Erro ao validar integridade:', error)
        erros.push(`Erro interno: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)

        return { valida: false, erros, avisos, detalhes }
    }
}

export async function repararIntegridadeSuperliga(campeonatoId: number): Promise<ReparoResult> {
    const reparosRealizados: string[] = []
    const errosNaoCorrigidos: string[] = []
    const detalhes: any = {}

    try {
        const validacao = await validarIntegridadeSuperliga(campeonatoId)

        if (validacao.valida) {
            return {
                reparosRealizados: ['Nenhum reparo necessário - estrutura já está válida'],
                errosNaoCorrigidos: [],
                detalhes: { validacao }
            }
        }

        const reparoConferencias = await repararConferencias(campeonatoId)
        reparosRealizados.push(...reparoConferencias.reparos)
        errosNaoCorrigidos.push(...reparoConferencias.erros)

        const reparoRegionais = await repararRegionais(campeonatoId)
        reparosRealizados.push(...reparoRegionais.reparos)
        errosNaoCorrigidos.push(...reparoRegionais.erros)

        const reparoGrupos = await repararGrupos(campeonatoId)
        reparosRealizados.push(...reparoGrupos.reparos)
        errosNaoCorrigidos.push(...reparoGrupos.erros)

        const validacaoFinal = await validarIntegridadeSuperliga(campeonatoId)
        detalhes.validacaoFinal = validacaoFinal

        return {
            reparosRealizados,
            errosNaoCorrigidos,
            detalhes
        }

    } catch (error) {
        console.error('Erro ao reparar integridade:', error)
        errosNaoCorrigidos.push(`Erro interno: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)

        return { reparosRealizados, errosNaoCorrigidos, detalhes }
    }
}


async function validarConferencias(campeonatoId: number, conferencias: any[]) {
    const erros: string[] = []
    const avisos: string[] = []

    if (conferencias.length !== 4) {
        erros.push(`Esperadas 4 conferências, encontradas ${conferencias.length}`)
    }

    const tiposEsperados: TipoConferencia[] = ['SUDESTE', 'SUL', 'NORDESTE', 'CENTRO_NORTE']
    const tiposEncontrados = conferencias.map(c => c.tipo)

    for (const tipo of tiposEsperados) {
        if (!tiposEncontrados.includes(tipo)) {
            erros.push(`Conferência ${tipo} não encontrada`)
        }
    }

    for (const conferencia of conferencias) {
        const config = SUPERLIGA_CONFIG.find(c => c.tipo === conferencia.tipo)

        if (!config) {
            erros.push(`Configuração não encontrada para conferência ${conferencia.tipo}`)
            continue
        }

        if (conferencia.totalTimes !== config.totalTimes) {
            avisos.push(`Conferência ${conferencia.tipo}: esperados ${config.totalTimes} times, configurados ${conferencia.totalTimes}`)
        }

        if (conferencia.regionais.length !== config.regionais.length) {
            erros.push(`Conferência ${conferencia.tipo}: esperados ${config.regionais.length} regionais, encontrados ${conferencia.regionais.length}`)
        }
    }

    return { erros, avisos, conferencias }
}

async function validarRegionais(campeonatoId: number) {
    const erros: string[] = []
    const avisos: string[] = []

    const regionais = await prisma.regional.findMany({
        where: {
            conferencia: { campeonatoId }
        },
        include: {
            conferencia: true
        }
    })

    if (regionais.length !== 8) {
        erros.push(`Esperados 8 regionais, encontrados ${regionais.length}`)
    }

    const tiposEsperados: TipoRegional[] = [
        'SERRAMAR', 'CANASTRA', 'CANTAREIRA',
        'ARAUCARIA', 'PAMPA', 
        'ATLANTICO', 
        'CERRADO', 'AMAZONIA' 
    ]

    const tiposEncontrados = regionais.map(r => r.tipo)

    for (const tipo of tiposEsperados) {
        if (!tiposEncontrados.includes(tipo)) {
            erros.push(`Regional ${tipo} não encontrado`)
        }
    }

    return { erros, avisos, regionais }
}

async function validarDistribuicaoTimes(campeonatoId: number) {
    const erros: string[] = []
    const avisos: string[] = []

    const grupos = await prisma.grupo.findMany({
        where: { campeonatoId },
        include: {
            times: {
                include: { time: true }
            }
        }
    })

    const temporada = (await prisma.campeonato.findUnique({
        where: { id: campeonatoId },
        select: { temporada: true }
    }))?.temporada

    if (!temporada) {
        erros.push('Temporada do campeonato não encontrada')
        return { erros, avisos, times: [], grupos }
    }

    const todosOsTimes = await prisma.time.findMany({
        where: { temporada }
    })

    if (todosOsTimes.length !== 32) {
        erros.push(`Esperados 32 times na temporada ${temporada}, encontrados ${todosOsTimes.length}`)
    }

    for (const grupo of grupos) {
        const regionalInfo = await prisma.regional.findUnique({
            where: { id: grupo.regionalId || 0 },
            include: { conferencia: true }
        })

        if (!regionalInfo) {
            erros.push(`Grupo ${grupo.nome} não está associado a um regional válido`)
            continue
        }

        const regional = regionalInfo.tipo as TipoRegional
        const timesEsperados = TIMES_SUPERLIGA[regional]

        if (!timesEsperados) {
            erros.push(`Regional ${regional} não tem times configurados`)
            continue
        }

        if (grupo.times.length !== timesEsperados.length) {
            erros.push(`Regional ${regional}: esperados ${timesEsperados.length} times, encontrados ${grupo.times.length}`)
        }

        const nomesTimesGrupo = grupo.times.map(gt => gt.time.nome)
        for (const nomeEsperado of timesEsperados) {
            if (!nomesTimesGrupo.includes(nomeEsperado)) {
                erros.push(`Time "${nomeEsperado}" não encontrado no regional ${regional}`)
            }
        }

        for (const nomeTime of nomesTimesGrupo) {
            if (!timesEsperados.includes(nomeTime)) {
                avisos.push(`Time "${nomeTime}" no regional ${regional} não está na configuração esperada`)
            }
        }
    }

    return { erros, avisos, times: todosOsTimes, grupos }
}

async function validarJogos(campeonatoId: number) {
    const avisos: string[] = []

    const jogos = await prisma.jogo.findMany({
        where: { campeonatoId }
    })

    if (jogos.length === 0) {
        avisos.push('Nenhum jogo encontrado - temporada regular ainda não foi gerada')
    } else {
        const jogosTemporadaRegular = jogos.filter(j => j.fase === 'TEMPORADA_REGULAR')
        const jogosPlayoffs = jogos.filter(j => j.fase !== 'TEMPORADA_REGULAR')

        if (jogosTemporadaRegular.length > 0) {
            avisos.push(`${jogosTemporadaRegular.length} jogos da temporada regular encontrados`)
        }

        if (jogosPlayoffs.length > 0) {
            avisos.push(`${jogosPlayoffs.length} jogos de playoffs encontrados`)
        }
    }

    return { avisos }
}


async function repararConferencias(campeonatoId: number) {
    const reparos: string[] = []
    const erros: string[] = []

    try {
        const conferenciasExistentes = await prisma.conferencia.findMany({
            where: { campeonatoId }
        })

        const tiposExistentes = conferenciasExistentes.map(c => c.tipo)

        for (let i = 0; i < SUPERLIGA_CONFIG.length; i++) {
            const config = SUPERLIGA_CONFIG[i]
            if (!tiposExistentes.includes(config.tipo)) {
                await prisma.conferencia.create({
                    data: {
                        nome: config.nome,
                        tipo: config.tipo,
                        icone: config.icone,
                        campeonatoId,
                        ordem: i + 1,
                        totalTimes: config.totalTimes
                    }
                })
                reparos.push(`Conferência ${config.nome} criada`)
            }
        }

        return { reparos, erros }
    } catch (error) {
        erros.push(`Erro ao reparar conferências: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
        return { reparos, erros }
    }
}

async function repararRegionais(campeonatoId: number) {
    const reparos: string[] = []
    const erros: string[] = []

    try {
        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId },
            include: { regionais: true }
        })

        for (const conferencia of conferencias) {
            const config = SUPERLIGA_CONFIG.find(c => c.tipo === conferencia.tipo)
            if (!config) continue

            const regionaisExistentes = conferencia.regionais.map(r => r.tipo)

            for (let j = 0; j < config.regionais.length; j++) {
                const regionalConfig = config.regionais[j]
                if (!regionaisExistentes.includes(regionalConfig.tipo)) {
                    await prisma.regional.create({
                        data: {
                            nome: regionalConfig.nome,
                            tipo: regionalConfig.tipo,
                            conferenciaId: conferencia.id,
                            ordem: j + 1,
                            timesPorRegional: regionalConfig.timesPorRegional
                        }
                    })
                    reparos.push(`Regional ${regionalConfig.nome} criado na conferência ${conferencia.nome}`)
                }
            }
        }

        return { reparos, erros }
    } catch (error) {
        erros.push(`Erro ao reparar regionais: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
        return { reparos, erros }
    }
}

async function repararGrupos(campeonatoId: number) {
    const reparos: string[] = []
    const erros: string[] = []

    try {
        const regionais = await prisma.regional.findMany({
            where: {
                conferencia: { campeonatoId }
            }
        })

        for (const regional of regionais) {
            const grupoExistente = await prisma.grupo.findFirst({
                where: {
                    campeonatoId,
                    regionalId: regional.id
                }
            })

            if (!grupoExistente) {
                await prisma.grupo.create({
                    data: {
                        nome: `Grupo ${regional.nome}`,
                        campeonatoId,
                        regionalId: regional.id,
                        ordem: 1,
                    }
                })
                reparos.push(`Grupo criado para regional ${regional.nome}`)
            }
        }

        return { reparos, erros }
    } catch (error) {
        erros.push(`Erro ao reparar grupos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
        return { reparos, erros }
    }
}