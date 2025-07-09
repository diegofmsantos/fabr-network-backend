// scripts/gerar-estatisticas-fake.ts
// Script para gerar estatísticas realistas de todos os 64 jogos da temporada regular

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogadorEstatistica {
    jogador_id: number
    jogador_nome: string
    time_id: number
    time_nome: string
    id_jogo: number
    data_jogo: string
    posicao: string
    setor: string

    // Estatísticas de passe
    passes_completos: number
    passes_tentados: number
    jardas_de_passe: number
    td_passados: number
    interceptacoes_sofridas: number
    sacks_sofridos: number
    fumble_de_passador: number

    // Estatísticas de corrida
    corridas: number
    jardas_corridas: number
    tds_corridos: number
    fumble_de_corredor: number

    // Estatísticas de recepção
    recepcoes: number
    alvo: number
    jardas_recebidas: number
    tds_recebidos: number

    // Estatísticas de retorno
    retornos: number
    jardas_retornadas: number
    td_retornados: number

    // Estatísticas de defesa
    tackles_totais: number
    tackles_for_loss: number
    sacks_forcado: number
    fumble_forcado: number
    interceptacao_forcada: number
    passe_desviado: number
    safety: number
    td_defensivo: number

    // Estatísticas de kicker
    xp_bons: number
    tentativas_de_xp: number
    fg_bons: number
    tentativas_de_fg: number
    fg_mais_longo: number

    // Estatísticas de punter
    punts: number
    jardas_de_punt: number
}

// Funções para gerar estatísticas realistas por posição
function gerarEstatisticasQB(isStarter: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
    if (!isStarter) {
        return {
            passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0, td_passados: 0,
            interceptacoes_sofridas: 0, sacks_sofridos: 0, fumble_de_passador: 0,
            corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0
        }
    }

    // QB titular - estatísticas realistas baseadas na pontuação do time
    const fatorPerformance = Math.max(0.3, pontuacaoTime / 35) // Times que marcam mais pontos têm QBs melhores

    const passes_tentados = Math.floor(Math.random() * 15 + 20) // 20-35 tentativas
    const completion_rate = 0.55 + (fatorPerformance * 0.25) // 55-80% de aproveitamento
    const passes_completos = Math.floor(passes_tentados * completion_rate)

    return {
        passes_completos,
        passes_tentados,
        jardas_de_passe: Math.floor(passes_completos * (8 + Math.random() * 7)), // 8-15 jardas por passe
        td_passados: Math.floor(Math.random() * 4 * fatorPerformance), // 0-3 TDs
        interceptacoes_sofridas: Math.random() < (0.15 / fatorPerformance) ? 1 : 0, // Mais INT se performance baixa
        sacks_sofridos: Math.floor(Math.random() * 4), // 0-3 sacks
        fumble_de_passador: Math.random() < 0.1 ? 1 : 0,
        corridas: Math.floor(Math.random() * 5), // 0-4 corridas
        jardas_corridas: Math.floor(Math.random() * 25), // 0-25 jardas corridas
        tds_corridos: Math.random() < 0.2 ? 1 : 0,
        fumble_de_corredor: 0
    }
}

function gerarEstatisticasRB(isPrimary: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
    if (!isPrimary) {
        // RB reserva - poucos carries
        return {
            corridas: Math.floor(Math.random() * 5), // 0-4 carries
            jardas_corridas: Math.floor(Math.random() * 20), // 0-20 jardas
            tds_corridos: Math.random() < 0.15 ? 1 : 0,
            fumble_de_corredor: 0,
            recepcoes: Math.floor(Math.random() * 3), // 0-2 recepções
            alvo: Math.floor(Math.random() * 4),
            jardas_recebidas: Math.floor(Math.random() * 15),
            tds_recebidos: 0
        }
    }

    // RB titular
    const fatorPerformance = Math.max(0.4, pontuacaoTime / 30)
    const corridas = Math.floor(Math.random() * 10 + 10) // 10-20 carries

    return {
        corridas,
        jardas_corridas: Math.floor(corridas * (3.5 + Math.random() * 2)), // 3.5-5.5 jardas por carry
        tds_corridos: Math.floor(Math.random() * 3 * fatorPerformance), // 0-2 TDs
        fumble_de_corredor: Math.random() < 0.08 ? 1 : 0,
        recepcoes: Math.floor(Math.random() * 6), // 0-5 recepções
        alvo: Math.floor(Math.random() * 8),
        jardas_recebidas: Math.floor(Math.random() * 40),
        tds_recebidos: Math.random() < 0.1 ? 1 : 0
    }
}

function gerarEstatisticasWR(isStarter: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
    const fatorPerformance = Math.max(0.4, pontuacaoTime / 30)

    if (!isStarter) {
        return {
            recepcoes: Math.floor(Math.random() * 3), // 0-2 recepções
            alvo: Math.floor(Math.random() * 5),
            jardas_recebidas: Math.floor(Math.random() * 25),
            tds_recebidos: Math.random() < 0.1 ? 1 : 0
        }
    }

    // WR titular
    const alvos = Math.floor(Math.random() * 8 + 4) // 4-12 alvos
    const catch_rate = 0.5 + (fatorPerformance * 0.3) // 50-80% de aproveitamento
    const recepcoes = Math.floor(alvos * catch_rate)

    return {
        recepcoes,
        alvo: alvos,
        jardas_recebidas: Math.floor(recepcoes * (10 + Math.random() * 8)), // 10-18 jardas por recepção
        tds_recebidos: Math.floor(Math.random() * 2 * fatorPerformance), // 0-1 TD
        retornos: Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0, // Alguns WRs retornam
        jardas_retornadas: Math.floor(Math.random() * 30),
        td_retornados: Math.random() < 0.05 ? 1 : 0
    }
}

function gerarEstatisticasDefesa(posicao: string): Partial<JogadorEstatistica> {
    const tackles_base = posicao.includes('LB') ? 8 : posicao.includes('S') ? 6 : 4

    return {
        tackles_totais: Math.floor(Math.random() * 6 + tackles_base), // LB mais tackles
        tackles_for_loss: Math.floor(Math.random() * 2),
        sacks_forcado: posicao.includes('DL') || posicao.includes('LB') ? Math.floor(Math.random() * 2) : 0,
        fumble_forcado: Math.random() < 0.1 ? 1 : 0,
        interceptacao_forcada: posicao.includes('CB') || posicao.includes('S') ? (Math.random() < 0.15 ? 1 : 0) : 0,
        passe_desviado: posicao.includes('CB') || posicao.includes('S') ? Math.floor(Math.random() * 3) : 0,
        safety: Math.random() < 0.02 ? 1 : 0,
        td_defensivo: Math.random() < 0.03 ? 1 : 0
    }
}

function gerarEstatisticasKicker(placares: { casa: number, visitante: number }, isTimeKicker: boolean): Partial<JogadorEstatistica> {
    if (!isTimeKicker) return { xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0, tentativas_de_fg: 0, fg_mais_longo: 0 }

    const tds = Math.floor(placares.casa / 7) + Math.floor(placares.visitante / 7) // Estimar TDs pelo placar
    const tentativas_xp = Math.floor(tds * 0.8) // Nem todo TD vira XP
    const tentativas_fg = Math.floor(Math.random() * 4 + 1) // 1-4 tentativas de FG

    return {
        xp_bons: Math.floor(tentativas_xp * 0.95), // 95% de aproveitamento em XP
        tentativas_de_xp: tentativas_xp,
        fg_bons: Math.floor(tentativas_fg * 0.75), // 75% de aproveitamento em FG
        tentativas_de_fg: tentativas_fg,
        fg_mais_longo: Math.floor(Math.random() * 20 + 35) // 35-55 jardas
    }
}



function gerarEstatisticasPunter(isTimePunter: boolean): Partial<JogadorEstatistica> {
    if (!isTimePunter) return { punts: 0, jardas_de_punt: 0 }

    const punts = Math.floor(Math.random() * 4 + 2) // 2-6 punts por jogo

    return {
        punts,
        jardas_de_punt: Math.floor(punts * (40 + Math.random() * 10)) // 40-50 jardas por punt
    }
}

async function gerarEstatisticasFake(): Promise<void> {
    console.log('📊 GERANDO ESTATÍSTICAS FAKE PARA TODOS OS JOGOS DA TEMPORADA REGULAR\n')

    try {
        // 1. Buscar todos os jogos finalizados da temporada regular
        const jogos = await prisma.jogo.findMany({
            where: {
                fase: 'TEMPORADA_REGULAR',
                status: 'FINALIZADO',
                temporada: '2025'
            },
            include: {
                timeCasa: true,
                timeVisitante: true
            },
            orderBy: { id: 'asc' }
        })

        if (jogos.length === 0) {
            console.error('❌ Nenhum jogo finalizado encontrado!')
            console.log('Certifique-se de ter importado os resultados dos jogos primeiro.')
            return
        }

        console.log(`✅ Encontrados ${jogos.length} jogos finalizados`)

        // 2. Buscar todos os jogadores da temporada 2025
        const jogadores = await prisma.jogadorTime.findMany({
            where: { temporada: '2025' },
            include: {
                jogador: true,
                time: true
            }
        })

        console.log(`✅ Encontrados ${jogadores.length} jogadores`)

        const todasEstatisticas: JogadorEstatistica[] = []
        let jogoCount = 0

        // 3. Gerar estatísticas para cada jogo
        for (const jogo of jogos) {
            jogoCount++
            console.log(`🏈 Processando jogo ${jogoCount}/${jogos.length}: ${jogo.timeCasa.nome} vs ${jogo.timeVisitante.nome}`)

            const placares = {
                casa: jogo.placarCasa || 0,
                visitante: jogo.placarVisitante || 0
            }

            // Jogadores de ambos os times
            const jogadoresCasa = jogadores.filter(j => j.timeId === jogo.timeCasaId)
            const jogadoresVisitante = jogadores.filter(j => j.timeId === jogo.timeVisitanteId)

            // Processar cada time
            for (const time of [
                { jogadores: jogadoresCasa, pontuacao: placares.casa, isHome: true },
                { jogadores: jogadoresVisitante, pontuacao: placares.visitante, isHome: false }
            ]) {

                // Definir starters por posição (primeira pessoa de cada posição)
                const startersPorPosicao = new Map<string, boolean>()

                for (const jogadorTime of time.jogadores) {
                    const posicao = jogadorTime.jogador.posicao
                    const isStarter = !startersPorPosicao.has(posicao)
                    if (isStarter) startersPorPosicao.set(posicao, true)

                    // Gerar estatísticas baseadas na posição
                    let estatisticas: Partial<JogadorEstatistica> = {}

                    // Zerar todas as estatísticas primeiro
                    const estatisticasZeradas: Partial<JogadorEstatistica> = {
                        passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0, td_passados: 0,
                        interceptacoes_sofridas: 0, sacks_sofridos: 0, fumble_de_passador: 0,
                        corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0,
                        recepcoes: 0, alvo: 0, jardas_recebidas: 0, tds_recebidos: 0,
                        retornos: 0, jardas_retornadas: 0, td_retornados: 0,
                        tackles_totais: 0, tackles_for_loss: 0, sacks_forcado: 0, fumble_forcado: 0,
                        interceptacao_forcada: 0, passe_desviado: 0, safety: 0, td_defensivo: 0,
                        xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0, tentativas_de_fg: 0, fg_mais_longo: 0,
                        punts: 0, jardas_de_punt: 0
                    }

                    // Aplicar estatísticas específicas por posição
                    if (posicao === 'QB') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasQB(isStarter, time.pontuacao) }
                    } else if (posicao === 'RB' || posicao === 'FB') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasRB(isStarter, time.pontuacao) }
                    } else if (posicao === 'WR' || posicao === 'TE') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasWR(isStarter, time.pontuacao) }
                    } else if (jogadorTime.jogador.setor === 'Defesa') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasDefesa(posicao) }
                    } else if (posicao === 'K') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasKicker(placares, isStarter) }
                    } else if (posicao === 'P') {
                        estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasPunter(isStarter) }
                    } else {
                        // Outras posições - estatísticas zeradas
                        estatisticas = estatisticasZeradas
                    }

                    // Adicionar à lista
                    todasEstatisticas.push({
                        jogador_id: jogadorTime.jogadorId,
                        jogador_nome: jogadorTime.jogador.nome,
                        time_id: jogadorTime.timeId,
                        time_nome: jogadorTime.time.nome,
                        id_jogo: jogo.id,
                        data_jogo: jogo.dataJogo.toISOString().split('T')[0],
                        posicao: jogadorTime.jogador.posicao,
                        setor: jogadorTime.jogador.setor,
                        ...estatisticas
                    } as JogadorEstatistica)
                }
            }
        }

        console.log(`\n📈 Total de registros de estatísticas gerados: ${todasEstatisticas.length}`)

        // 4. Criar planilha Excel
        const worksheet = XLSX.utils.json_to_sheet(todasEstatisticas)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'ESTATISTICAS')

        // 5. Salvar arquivo
        const outputDir = path.join(process.cwd(), 'planilhas-geradas')
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
        const filename = `estatisticas-temporada-regular-${timestamp}.xlsx`
        const outputFile = path.join(outputDir, filename)

        XLSX.writeFile(workbook, outputFile)

        console.log(`\n✅ PLANILHA GERADA COM SUCESSO!`)
        console.log(`📁 Arquivo: ${filename}`)
        console.log(`📊 Total de linhas: ${todasEstatisticas.length}`)
        console.log(`🏈 Jogos processados: ${jogos.length}`)
        console.log(`👥 Jogadores únicos: ${new Set(todasEstatisticas.map(e => e.jogador_id)).size}`)

        // 6. Estatísticas do arquivo
        const estatsPorJogo = todasEstatisticas.reduce((acc, stat) => {
            acc[stat.id_jogo] = (acc[stat.id_jogo] || 0) + 1
            return acc
        }, {} as Record<number, number>)

        console.log(`\n📋 DISTRIBUIÇÃO POR JOGO:`)
        console.log(`   Média de jogadores por jogo: ${Math.round(todasEstatisticas.length / jogos.length)}`)
        console.log(`   Maior participação: ${Math.max(...Object.values(estatsPorJogo))} jogadores`)
        console.log(`   Menor participação: ${Math.min(...Object.values(estatsPorJogo))} jogadores`)

        console.log(`\n🚀 PRÓXIMOS PASSOS:`)
        console.log(`1. Acesse o painel admin: http://localhost:3001/admin/importar`)
        console.log(`2. Vá para a aba "Importar Estatísticas"`)
        console.log(`3. Faça upload do arquivo: ${filename}`)
        console.log(`4. As estatísticas serão consolidadas automaticamente por jogador`)

    } catch (error) {
        console.error('❌ Erro ao gerar estatísticas:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}



// Executar se chamado diretamente
if (require.main === module) {
    gerarEstatisticasFake()
        .then(() => {
            console.log('\n🎉 Geração de estatísticas concluída!')
            process.exit(0)
        })
        .catch(error => {
            console.error('\n💥 Erro na geração:', error)
            process.exit(1)
        })
}

export default gerarEstatisticasFake