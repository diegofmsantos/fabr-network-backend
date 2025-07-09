// CRIAR arquivo scripts/gerar-playoffs-nordeste.ts

import { PrismaClient } from '@prisma/client'
import { gerarPlayoffsNordeste } from '../src/utils/superligaUtils'

const prisma = new PrismaClient()

async function executarGeracaoPlayoffsNordeste() {
    console.log('🏆 GERANDO PLAYOFFS DA CONFERÊNCIA NORDESTE\n')
    
    try {
        // 1. Buscar Superliga 2025
        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true },
            include: { 
                conferencias: {
                    where: { tipo: 'NORDESTE' }
                }
            }
        })
        
        if (!superliga) {
            console.error('❌ Superliga 2025 não encontrada!')
            return
        }
        
        const nordeste = superliga.conferencias[0]
        if (!nordeste) {
            console.error('❌ Conferência Nordeste não encontrada!')
            return
        }
        
        console.log('✅ Encontrada:', superliga.nome)
        console.log('✅ Conferência:', nordeste.nome)
        
        // 2. Verificar se já existem playoffs
        const playoffsExistentes = await prisma.playoffJogo.findMany({
            where: { 
                campeonatoId: superliga.id,
                conferenciaId: nordeste.id
            }
        })
        
        if (playoffsExistentes.length > 0) {
            console.log(`⚠️ Já existem ${playoffsExistentes.length} jogos de playoff!`)
            console.log('Removendo playoffs existentes...')
            
            await prisma.playoffJogo.deleteMany({
                where: { 
                    campeonatoId: superliga.id,
                    conferenciaId: nordeste.id
                }
            })
            console.log('✅ Playoffs antigos removidos')
        }
        
        // 3. Gerar novos playoffs
        console.log('\n🏟️ Gerando playoffs Nordeste...')
        const resultado = await gerarPlayoffsNordeste(superliga.id, nordeste.id)
        
        console.log('\n🎉 PLAYOFFS GERADOS COM SUCESSO!')
        console.log(`   🃏 Wild Cards: ${resultado.wildcards.length}`)
        console.log(`   🏅 Semifinais: ${resultado.semifinais.length}`)
        console.log(`   🏆 Final: 1`)
        console.log(`   📊 Total: ${resultado.wildcards.length + resultado.semifinais.length + 1} jogos`)
        
        // 4. Verificar jogos criados
        const jogosPlayoff = await prisma.playoffJogo.findMany({
            where: { 
                campeonatoId: superliga.id,
                conferenciaId: nordeste.id
            },
            include: {
                timeClassificado1: true,
                timeClassificado2: true,
                timeVencedor: true
            },
            orderBy: { fase: 'asc' }
        })
        
        console.log('\n📋 JOGOS CRIADOS:')
        for (const jogo of jogosPlayoff) {
            const time1 = jogo.timeClassificado1?.sigla || 'TBD'
            const time2 = jogo.timeClassificado2?.sigla || 'TBD'
            const vencedor = jogo.timeVencedor?.sigla || ''
            
            console.log(`   ${jogo.fase}: ${jogo.nome}`)
            console.log(`      ${time1} vs ${time2} ${vencedor ? `(Vencedor: ${vencedor})` : ''}`)
            console.log(`      Status: ${jogo.status}`)
        }
        
        console.log('\n✅ Agora você pode verificar:')
        console.log('   🌐 Frontend: http://localhost:3000/superliga/2025/wild-card')
        console.log('   🌐 Frontend: http://localhost:3000/superliga/2025/semifinal-conferencia')
        console.log('   🌐 Frontend: http://localhost:3000/superliga/2025/final-conferencia')
        
    } catch (error) {
        console.error('💥 Erro:', error)
    } finally {
        await prisma.$disconnect()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    executarGeracaoPlayoffsNordeste()
}

export { executarGeracaoPlayoffsNordeste }