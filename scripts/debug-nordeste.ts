// SALVAR como scripts/debug-nordeste.ts

import { PrismaClient } from '@prisma/client'
import { calcularClassificacaoPorConferencia } from '../src/utils/distribuicaoUtils'

const prisma = new PrismaClient()

async function debugConferenciaNordeste() {
    console.log('🔍 DEBUG: CONFERÊNCIA NORDESTE\n')
    
    try {
        // 1. Verificar se existe superliga 2025
        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true },
            include: { 
                conferencias: {
                    include: { regionais: true }
                }
            }
        })
        
        if (!superliga) {
            console.error('❌ Superliga 2025 não encontrada!')
            return
        }
        
        console.log('✅ Superliga encontrada:', superliga.nome)
        
        // 2. Verificar conferências
        console.log('\n📊 CONFERÊNCIAS CADASTRADAS:')
        for (const conf of superliga.conferencias) {
            console.log(`   ${conf.tipo}: ${conf.nome} (${conf.regionais.length} regionais)`)
            for (const regional of conf.regionais) {
                console.log(`      └─ ${regional.tipo}: ${regional.nome}`)
            }
        }
        
        // 3. Verificar se existe conferência NORDESTE
        const nordeste = superliga.conferencias.find(c => c.tipo === 'NORDESTE')
        if (!nordeste) {
            console.error('\n❌ CONFERÊNCIA NORDESTE NÃO ENCONTRADA!')
            console.log('Execute o script de distribuição de times primeiro')
            return
        }
        
        console.log('\n✅ Conferência Nordeste encontrada:', nordeste.nome)
        console.log('   Regionais:', nordeste.regionais.map(r => r.tipo))
        
        // 4. Verificar regional ATLÂNTICO
        const atlantico = nordeste.regionais.find(r => r.tipo === 'ATLANTICO')
        if (!atlantico) {
            console.error('\n❌ REGIONAL ATLÂNTICO NÃO ENCONTRADO!')
            return
        }
        
        // 5. Verificar times no regional usando DistribuicaoTime
        const timesAtlantico = await prisma.distribuicaoTime.findMany({
            where: { regionalId: atlantico.id },
            include: { time: true }
        })
        
        console.log(`\n🏖️ REGIONAL ATLÂNTICO (${timesAtlantico.length} times):`)
        for (const tr of timesAtlantico) {
            console.log(`   • ${tr.time.nome} (${tr.time.sigla})`)
        }
        
        if (timesAtlantico.length < 6) {
            console.error(`\n❌ Regional Atlântico tem apenas ${timesAtlantico.length} times!`)
            console.log('Mínimo necessário: 6 times')
            return
        }
        
        // 6. Verificar classificação
        console.log('\n📈 TESTANDO CLASSIFICAÇÃO...')
        const classificacao = await calcularClassificacaoPorConferencia(superliga.id)
        
        if (classificacao.NORDESTE) {
            console.log('✅ Classificação Nordeste encontrada:')
            const nordesteClass = classificacao.NORDESTE[0] // Regional Atlântico
            if (nordesteClass && nordesteClass.times) {
                nordesteClass.times.forEach((time: any, index: number) => {
                    console.log(`   ${index + 1}º. ${time.time.nome} - ${time.vitorias}V ${time.derrotas}D`)
                })
            }
        } else {
            console.error('❌ Classificação Nordeste não encontrada!')
        }
        
        // 7. Verificar jogos playoffs existentes
        const playoffsNordeste = await prisma.playoffJogo.findMany({
            where: { 
                campeonatoId: superliga.id,
                conferenciaId: nordeste.id
            },
            orderBy: { fase: 'asc' }
        })
        
        console.log(`\n🏆 PLAYOFFS NORDESTE (${playoffsNordeste.length} jogos):`)
        if (playoffsNordeste.length === 0) {
            console.log('   ⚠️ Nenhum jogo de playoff gerado ainda')
        } else {
            for (const jogo of playoffsNordeste) {
                console.log(`   ${jogo.fase}: ${jogo.nome} (${jogo.status})`)
            }
        }
        
        console.log('\n🎯 RESUMO:')
        console.log(`   ✅ Conferência: ${nordeste ? 'OK' : 'ERRO'}`)
        console.log(`   ✅ Regional: ${atlantico ? 'OK' : 'ERRO'}`)
        console.log(`   ✅ Times: ${timesAtlantico.length >= 6 ? 'OK' : 'ERRO'} (${timesAtlantico.length}/6)`)
        console.log(`   ✅ Classificação: ${classificacao.NORDESTE ? 'OK' : 'ERRO'}`)
        console.log(`   ✅ Playoffs: ${playoffsNordeste.length > 0 ? 'OK' : 'PENDENTE'}`)
        
        // 8. Testar especificamente se os playoffs podem ser gerados
        if (classificacao.NORDESTE && timesAtlantico.length >= 6) {
            console.log('\n🧪 TESTANDO GERAÇÃO DE PLAYOFFS...')
            try {
                // Importar e testar a função
                const { gerarPlayoffsNordeste } = await import('../src/utils/superligaUtils')
                
                console.log('   📝 Função gerarPlayoffsNordeste encontrada')
                console.log('   💡 Para gerar os playoffs, execute:')
                console.log('   npm run ts-node -e "')
                console.log('     import { gerarPlayoffsNordeste } from \"./src/utils/superligaUtils\";')
                console.log(`     gerarPlayoffsNordeste(${superliga.id}, ${nordeste.id}).then(() => console.log(\"Feito!\"))`)
                console.log('   "')
                
            } catch (error) {
                console.error('   ❌ Erro ao importar função:', error)
            }
        }
        
    } catch (error) {
        console.error('💥 Erro no debug:', error)
    } finally {
        await prisma.$disconnect()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    debugConferenciaNordeste()
}

export { debugConferenciaNordeste }