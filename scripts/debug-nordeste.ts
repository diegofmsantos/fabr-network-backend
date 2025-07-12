// scripts/debug-nordeste.ts - Script para investigar o problema da Conferência Nordeste

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugConferenciaNordeste() {
    try {
        console.log('🔍 INVESTIGANDO PROBLEMA DA CONFERÊNCIA NORDESTE\n')

        // 1. Verificar se a Superliga existe
        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true }
        })

        if (!superliga) {
            console.error('❌ Superliga 2025 não encontrada')
            return
        }

        console.log(`✅ Superliga encontrada: ${superliga.nome} (ID: ${superliga.id})`)

        // 2. Verificar conferências criadas
        const conferencias = await prisma.conferencia.findMany({
            where: { campeonatoId: superliga.id },
            include: { regionais: true }
        })

        console.log(`\n📋 CONFERÊNCIAS ENCONTRADAS (${conferencias.length}):`)
        conferencias.forEach(conf => {
            console.log(`   ${conf.id}. ${conf.tipo} - ${conf.nome} (${conf.regionais.length} regionais)`)
            conf.regionais.forEach(reg => {
                console.log(`      └─ ${reg.tipo} - ${reg.nome}`)
            })
        })

        // 3. Verificar distribuição de times
        const distribuicao = await prisma.distribuicaoTime.findMany({
            where: { campeonatoId: superliga.id },
            include: {
                time: true,
                conferencia: true,
                regional: true
            }
        })

        console.log(`\n📊 DISTRIBUIÇÃO DE TIMES (${distribuicao.length} times):`)
        
        const timesPorConferencia: Record<string, number> = {}
        distribuicao.forEach(d => {
            timesPorConferencia[d.conferenciaType] = (timesPorConferencia[d.conferenciaType] || 0) + 1
        })

        Object.entries(timesPorConferencia).forEach(([conf, count]) => {
            console.log(`   ${conf}: ${count} times`)
        })

        // 4. Verificar especificamente NORDESTE
        const timesNordeste = distribuicao.filter(d => 
            d.conferenciaType === 'NORDESTE' || 
            d.conferencia.tipo === 'NORDESTE'
        )

        console.log(`\n🌵 TIMES DA CONFERÊNCIA NORDESTE (${timesNordeste.length}):`)
        timesNordeste.forEach(d => {
            console.log(`   - ${d.time.nome} (Regional: ${d.regionalType})`)
        })

        // 5. Verificar jogos finalizados da temporada regular
        const jogosTemporadaRegular = await prisma.jogo.findMany({
            where: {
                campeonatoId: superliga.id,
                fase: 'TEMPORADA REGULAR'
            }
        })

        const jogosFinalizados = jogosTemporadaRegular.filter(j => j.status === 'FINALIZADO')

        console.log(`\n⚽ JOGOS DA TEMPORADA REGULAR:`)
        console.log(`   Total: ${jogosTemporadaRegular.length}`)
        console.log(`   Finalizados: ${jogosFinalizados.length}`)
        console.log(`   Percentual: ${((jogosFinalizados.length / jogosTemporadaRegular.length) * 100).toFixed(1)}%`)

        // 6. Tentar calcular classificação
        console.log(`\n📈 TESTANDO CLASSIFICAÇÃO POR CONFERÊNCIA:`)
        
        let classificacao: any = null
        
        try {
            const { calcularClassificacaoPorConferencia } = await import('../src/utils/distribuicaoUtils')
            classificacao = await calcularClassificacaoPorConferencia(superliga.id)
            
            console.log(`   Conferências na classificação: ${Object.keys(classificacao).join(', ')}`)
            
            Object.entries(classificacao).forEach(([conf, regionais]: [string, any]) => {
                console.log(`   ${conf}: ${regionais.length} regionais`)
                if (Array.isArray(regionais)) {
                    regionais.forEach((reg: any) => {
                        console.log(`      └─ ${reg.regionalType}: ${reg.times?.length || 0} times`)
                    })
                }
            })

            // 7. Verificar se NORDESTE existe na classificação
            const nordeste = classificacao['NORDESTE']
            if (nordeste) {
                console.log(`\n✅ NORDESTE encontrado na classificação:`)
                console.log(`   Regionais: ${nordeste.length}`)
                if (nordeste[0] && nordeste[0].times) {
                    console.log(`   Times no primeiro regional: ${nordeste[0].times.length}`)
                    nordeste[0].times.forEach((time: any, index: number) => {
                        console.log(`      ${index + 1}º. ${time.time?.nome || 'Nome não disponível'} (${time.vitorias}V - ${time.derrotas}D)`)
                    })
                }
            } else {
                console.error(`❌ NORDESTE NÃO ENCONTRADO na classificação`)
                console.log(`   Chaves disponíveis: ${Object.keys(classificacao)}`)
            }

        } catch (error) {
            console.error('❌ Erro ao calcular classificação:', error)
        }

        // 8. Verificar playoffs existentes
        const playoffsExistentes = await prisma.playoffJogo.findMany({
            where: { campeonatoId: superliga.id },
            include: { conferencia: true }
        })

        console.log(`\n🏆 PLAYOFFS EXISTENTES (${playoffsExistentes.length}):`)
        
        const playoffsPorConferencia: Record<string, number> = {}
        playoffsExistentes.forEach(p => {
            const conf = p.conferencia?.tipo || 'SEM_CONFERENCIA'
            playoffsPorConferencia[conf] = (playoffsPorConferencia[conf] || 0) + 1
        })

        Object.entries(playoffsPorConferencia).forEach(([conf, count]) => {
            console.log(`   ${conf}: ${count} jogos`)
        })

        // 9. Verificar logs do último processo
        console.log(`\n📋 RESUMO DOS PROBLEMAS IDENTIFICADOS:`)
        
        const problemas = []
        
        if (timesNordeste.length !== 6) {
            problemas.push(`❌ Nordeste tem ${timesNordeste.length} times em vez de 6`)
        }
        
        if (!classificacao || !classificacao['NORDESTE']) {
            problemas.push(`❌ Nordeste não aparece na classificação`)
        }
        
        if ((playoffsPorConferencia['NORDESTE'] || 0) === 0) {
            problemas.push(`❌ Nordeste não tem playoffs gerados`)
        }

        if (jogosFinalizados.length < jogosTemporadaRegular.length) {
            problemas.push(`⚠️  Temporada regular não está 100% finalizada (${jogosFinalizados.length}/${jogosTemporadaRegular.length})`)
        }

        if (problemas.length === 0) {
            console.log(`✅ Nenhum problema identificado - investigar logs do backend`)
        } else {
            problemas.forEach(problema => console.log(`   ${problema}`))
        }

    } catch (error) {
        console.error('❌ Erro durante debug:', error)
    } finally {
        await prisma.$disconnect()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    debugConferenciaNordeste()
        .then(() => {
            console.log('\n🔚 Debug concluído.')
            process.exit(0)
        })
        .catch(error => {
            console.error('\n💥 Erro durante debug:', error)
            process.exit(1)
        })
}

export default debugConferenciaNordeste