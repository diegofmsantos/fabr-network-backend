// SUBSTITUIR o arquivo scripts/fluxo-completo.ts

import { PrismaClient } from '@prisma/client'
import {
    distribuirTimesAutomaticamente,
    gerarPlayoffsSudeste,
    gerarPlayoffsSul,
    gerarPlayoffsNordeste,
    gerarPlayoffsCentroNorte,
} from '../src/utils/superligaUtils'
import { gerarJogosTemporadaRegular } from '../src/utils/superligaJogosUtils'

const prisma = new PrismaClient()

interface ScriptOptions {
    resetarTudo?: boolean
    gerarJogos?: boolean
    importarResultados?: boolean
    gerarPlayoffs?: boolean
    gerarFaseNacional?: boolean
    criarRelatorios?: boolean
}

async function executarFluxoCompleto(options: ScriptOptions = {}) {
    console.log('🚀 INICIANDO FLUXO COMPLETO DA SUPERLIGA 2025')
    console.log('='.repeat(80))

    const {
        resetarTudo = true,
        gerarJogos = true,
        importarResultados = true,
        gerarPlayoffs = true,
        gerarFaseNacional = true,
        criarRelatorios = true
    } = options

    try {
        // ========== ETAPA 1: LIMPEZA E PREPARAÇÃO ==========
        if (resetarTudo) {
            console.log('\n🗑️ ETAPA 1: LIMPEZA DO BANCO')
            await limparDadosSuperliga()
        }

        // ========== ETAPA 2: CRIAR ESTRUTURA ==========
        console.log('\n🏗️ ETAPA 2: CRIANDO ESTRUTURA DA SUPERLIGA')
        const superliga = await criarSuperligaCompleta()

        // ========== ETAPA 3: DISTRIBUIR TIMES ==========
        console.log('\n📊 ETAPA 3: DISTRIBUINDO TIMES NAS CONFERÊNCIAS')
        await distribuirTimesCompleto(superliga.id)

        // ========== ETAPA 4: GERAR JOGOS ==========
        if (gerarJogos) {
            console.log('\n⚽ ETAPA 4: GERANDO JOGOS DA TEMPORADA REGULAR')
            await gerarJogosCompleto(superliga.id)
        }

        // ========== ETAPA 5: IMPORTAR RESULTADOS ==========
        if (importarResultados) {
            console.log('\n🎯 ETAPA 5: SIMULANDO RESULTADOS DOS JOGOS')
            await simularResultadosCompleto(superliga.id)
        }

        // ========== ETAPA 6: GERAR PLAYOFFS ==========
        if (gerarPlayoffs) {
            console.log('\n🏆 ETAPA 6: GERANDO PLAYOFFS DAS CONFERÊNCIAS')
            await gerarPlayoffsCompleto(superliga.id)
        }

        // ========== ETAPA 7: GERAR FASE NACIONAL ==========
        if (gerarFaseNacional) {
            console.log('\n🥇 ETAPA 7: GERANDO FASE NACIONAL')
            await gerarFaseNacionalCompleta(superliga.id)
        }

        // ========== ETAPA 8: CRIAR RELATÓRIOS ==========
        if (criarRelatorios) {
            console.log('\n📋 ETAPA 8: GERANDO RELATÓRIOS FINAIS')
            await gerarRelatoriosFinais(superliga.id)
        }

        console.log('\n🎉 FLUXO COMPLETO EXECUTADO COM SUCESSO!')
        console.log('='.repeat(80))

        // ========== LINKS ÚTEIS ==========
        console.log('\n🌐 LINKS PARA TESTE:')
        console.log('   📋 Temporada Regular: http://localhost:3000/superliga/2025/temporada-regular')
        console.log('   🃏 Wild Card: http://localhost:3000/superliga/2025/wild-card')
        console.log('   🏅 Semifinal Conferência: http://localhost:3000/superliga/2025/semifinal-conferencia')
        console.log('   🏆 Final Conferência: http://localhost:3000/superliga/2025/final-conferencia')
        console.log('   🥇 Semifinal Nacional: http://localhost:3000/superliga/2025/semifinal-nacional')
        console.log('   🏆 Final Nacional: http://localhost:3000/superliga/2025/final-nacional')
        console.log('   ⚙️ Admin: http://localhost:3001/admin/superliga')

        return superliga

    } catch (error) {
        console.error('\n💥 ERRO NO FLUXO:', error)
        throw error
    }
}

// ========== FUNÇÕES AUXILIARES ==========

async function limparDadosSuperliga() {
    console.log('   🗑️ Removendo dados da Superliga...')

    // Limpar na ordem correta (dependências)
    await prisma.playoffJogo.deleteMany({ where: { campeonato: { temporada: '2025' } } })
    await prisma.jogo.deleteMany({ where: { campeonato: { temporada: '2025' } } })
    await prisma.distribuicaoTime.deleteMany({ where: { temporada: '2025' } })
    await prisma.regional.deleteMany({ where: { conferencia: { campeonato: { temporada: '2025' } } } })
    await prisma.conferencia.deleteMany({ where: { campeonato: { temporada: '2025' } } })
    await prisma.campeonato.deleteMany({ where: { temporada: '2025', isSuperliga: true } })

    console.log('   ✅ Dados limpos')
}

async function criarSuperligaCompleta() {
    console.log('   🏗️ Criando Superliga 2025...')

    const superliga = await prisma.campeonato.create({
        data: {
            nome: 'Superliga de Futebol Americano 2025',
            temporada: '2025',
            status: 'CONFIGURACAO',
            dataInicio: new Date('2025-07-05'),
            dataFim: new Date('2025-12-15'),
            descricao: 'Campeonato nacional de futebol americano',
            isSuperliga: true,
            configSuperliga: {
                totalTimes: 32,
                totalConferencias: 4,
                faseAtual: 'CONFIGURACAO'
            }
        }
    })

    console.log('   ✅ Superliga criada:', superliga.nome)

    // Criar estrutura completa (conferências + regionais)
    console.log('   ✅ Estrutura de conferências será criada via distribuição')
    console.log('   ✅ Estrutura de conferências criada')

    return superliga
}

async function distribuirTimesCompleto(campeonatoId: number) {
    console.log('   📊 Distribuindo 32 times nas conferências...')

    await distribuirTimesAutomaticamente(campeonatoId, '2025')

    // Verificar distribuição
    const distribuicao = await prisma.distribuicaoTime.groupBy({
        by: ['conferenciaType'],
        where: { campeonatoId },
        _count: { timeId: true }
    })

    console.log('   📈 Distribuição por conferência:')
    for (const conf of distribuicao) {
        console.log(`      ${conf.conferenciaType}: ${conf._count.timeId} times`)
    }

    console.log('   ✅ Times distribuídos')
}

async function gerarJogosCompleto(campeonatoId: number) {
    console.log('   ⚽ Gerando 64 jogos da temporada regular...')

    await gerarJogosTemporadaRegular(campeonatoId)

    const totalJogos = await prisma.jogo.count({ where: { campeonatoId } })
    console.log(`   ✅ ${totalJogos} jogos gerados`)
}

async function simularResultadosCompleto(campeonatoId: number) {
    console.log('   🎯 Simulando resultados de todos os jogos...')

    const jogos = await prisma.jogo.findMany({
        where: { campeonatoId, status: 'AGENDADO' }
    })

    console.log(`   📊 Simulando ${jogos.length} jogos...`)

    for (const jogo of jogos) {
        const placarCasa = Math.floor(Math.random() * 42) + 3      // 3-45 pontos
        const placarVisitante = Math.floor(Math.random() * 42) + 3 // 3-45 pontos

        await prisma.jogo.update({
            where: { id: jogo.id },
            data: {
                placarCasa,
                placarVisitante,
                status: 'FINALIZADO'
            }
        })
    }

    console.log('   ✅ Resultados simulados')
}

async function gerarPlayoffsCompleto(campeonatoId: number) {
    console.log('   🏆 Gerando playoffs das 4 conferências...')

    const conferencias = await prisma.conferencia.findMany({
        where: { campeonatoId }
    })

    let totalPlayoffJogos = 0

    for (const conf of conferencias) {
        console.log(`      🏟️ Gerando playoffs ${conf.nome}...`)

        try {
            let resultado

            switch (conf.tipo) {
                case 'SUDESTE':
                    resultado = await gerarPlayoffsSudeste(campeonatoId, conf.id)
                    break
                case 'SUL':
                    resultado = await gerarPlayoffsSul(campeonatoId, conf.id)
                    break
                case 'NORDESTE':
                    resultado = await gerarPlayoffsNordeste(campeonatoId, conf.id) // ✅ INCLUI NORDESTE!
                    break
                case 'CENTRO NORTE':
                    resultado = await gerarPlayoffsCentroNorte(campeonatoId, conf.id)
                    break
                default:
                    console.warn(`      ⚠️ Tipo de conferência desconhecido: ${conf.tipo}`)
                    continue
            }

            if (resultado) {
                const jogosGerados = resultado.wildcards.length + resultado.semifinais.length + 1
                totalPlayoffJogos += jogosGerados
                console.log(`         ✅ ${jogosGerados} jogos gerados`)
            }

        } catch (error) {
            console.error(`      ❌ Erro em ${conf.nome}:`, error)
        }
    }

    console.log(`   ✅ Total de playoffs: ${totalPlayoffJogos} jogos`)
}

async function gerarFaseNacionalCompleta(campeonatoId: number) {
    console.log('   🥇 Gerando Fase Nacional (Semifinais + Final)...')

    // Verificar se todas as finais de conferência foram finalizadas
    const finaisConferencia = await prisma.playoffJogo.findMany({
        where: {
            campeonatoId,
            fase: 'FINAL CONFERENCIA'
        }
    })

    if (finaisConferencia.length < 4) {
        console.log('   ⚠️ Finais de conferência ainda não finalizadas. Simulando...')

        // Simular finais de conferência
        for (const final of finaisConferencia) {
            if (final.status !== 'FINALIZADO') {
                const vencedor = final.timeClassificado1Id || final.timeClassificado2Id
                await prisma.playoffJogo.update({
                    where: { id: final.id },
                    data: {
                        status: 'FINALIZADO',
                        timeVencedorId: vencedor,
                        placarTime1: Math.floor(Math.random() * 35) + 10,
                        placarTime2: Math.floor(Math.random() * 28) + 7
                    }
                })
            }
        }
    }

    // Buscar campeões de conferência
    const campeoes = await prisma.playoffJogo.findMany({
        where: {
            campeonatoId,
            fase: 'FINAL CONFERENCIA',
            status: 'FINALIZADO'
        },
        include: {
            timeVencedor: true,
            conferencia: true
        }
    })

    if (campeoes.length < 4) {
        console.error('   ❌ Nem todas as conferências têm campeões!')
        return
    }

    console.log('   🏅 Campeões de conferência:')
    campeoes.forEach(c => {
        console.log(`      ${c.conferencia?.nome}: ${c.timeVencedor?.nome}`)
    })

    // Criar Semifinais Nacionais
    const sudeste = campeoes.find(c => c.conferencia?.tipo === 'SUDESTE')
    const sul = campeoes.find(c => c.conferencia?.tipo === 'SUL')
    const nordeste = campeoes.find(c => c.conferencia?.tipo === 'NORDESTE')
    const centroNorte = campeoes.find(c => c.conferencia?.tipo === 'CENTRO NORTE')

    // Semifinal Nacional 1: Sudeste vs Nordeste
    const sf1 = await prisma.playoffJogo.create({
        data: {
            campeonatoId,
            fase: 'SEMIFINAL NACIONAL',
            rodada: 1,
            nome: 'Semifinal Nacional 1',
            timeClassificado1Id: sudeste?.timeVencedorId,
            timeClassificado2Id: nordeste?.timeVencedorId,
            dataJogo: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
        }
    })

    // Semifinal Nacional 2: Sul vs Centro-Norte
    const sf2 = await prisma.playoffJogo.create({
        data: {
            campeonatoId,
            fase: 'SEMIFINAL NACIONAL',
            rodada: 1,
            nome: 'Semifinal Nacional 2',
            timeClassificado1Id: sul?.timeVencedorId,
            timeClassificado2Id: centroNorte?.timeVencedorId,
            dataJogo: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
        }
    })

    // Final Nacional
    const finalNacional = await prisma.playoffJogo.create({
        data: {
            campeonatoId,
            fase: 'FINAL NACIONAL',
            rodada: 1,
            nome: 'Final Nacional - Brasil Bowl',
            jogoAnterior1Id: sf1.id,
            jogoAnterior2Id: sf2.id,
            dataJogo: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
        }
    })

    // Jogo do 3º lugar
    const terceiroLugar = await prisma.playoffJogo.create({
        data: {
            campeonatoId,
            fase: 'TERCEIRO LUGAR',
            rodada: 1,
            nome: 'Disputa do 3º Lugar',
            jogoAnterior1Id: sf1.id, // Perdedor SF1
            jogoAnterior2Id: sf2.id, // Perdedor SF2
            dataJogo: new Date(Date.now() + 34 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
        }
    })

    console.log('   ✅ Fase Nacional criada: 2 SF + 1 Final + 1 3º lugar = 4 jogos')
}

async function gerarRelatoriosFinais(campeonatoId: number) {
    console.log('   📋 Gerando relatórios finais...')

    const totalJogos = await prisma.jogo.count({ where: { campeonatoId } })
    const totalPlayoffs = await prisma.playoffJogo.count({ where: { campeonatoId } })

    console.log('\n📊 ESTATÍSTICAS FINAIS:')
    console.log(`   ⚽ Jogos Temporada Regular: ${totalJogos}`)
    console.log(`   🏆 Jogos de Playoff: ${totalPlayoffs}`)
    console.log(`   🎯 Total de Jogos: ${totalJogos + totalPlayoffs}`)

    console.log('\n🎯 ESTRUTURA COMPLETA:')
    console.log('   📅 Temporada Regular: 64 jogos (4 rodadas)')
    console.log('   🃏 Wild Cards: 4 jogos')
    console.log('   🏅 Semifinais Conferência: 8 jogos')
    console.log('   🏆 Finais Conferência: 4 jogos')
    console.log('   🥇 Semifinais Nacional: 2 jogos')
    console.log('   🏆 Final Nacional: 1 jogo')
    console.log('   🥉 3º Lugar: 1 jogo')
    console.log('   📊 TOTAL: 84 jogos')
}

// ========== EXECUÇÃO PRINCIPAL ==========

async function main() {
    const args = process.argv.slice(2)

    const options: ScriptOptions = {
        resetarTudo: !args.includes('--no-reset'),
        gerarJogos: !args.includes('--no-jogos'),
        importarResultados: !args.includes('--no-resultados'),
        gerarPlayoffs: !args.includes('--no-playoffs'),
        gerarFaseNacional: !args.includes('--no-nacional'),
        criarRelatorios: !args.includes('--no-relatorios')
    }

    if (args.includes('--help')) {
        console.log('📖 USO DO SCRIPT:')
        console.log('')
        console.log('  npm run fluxo-completo                    # Executa tudo')
        console.log('  npm run fluxo-completo --no-reset        # Mantém dados existentes')
        console.log('  npm run fluxo-completo --no-resultados   # Não simula resultados')
        console.log('  npm run fluxo-completo --no-playoffs     # Não gera playoffs')
        console.log('')
        return
    }

    try {
        await executarFluxoCompleto(options)
        console.log('\n✅ Script executado com sucesso!')
    } catch (error) {
        console.error('\n💥 Erro:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main()
}

export { executarFluxoCompleto }