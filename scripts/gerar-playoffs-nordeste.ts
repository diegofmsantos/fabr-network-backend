// scripts/gerar-playoffs-nordeste.ts - Script para gerar especificamente os playoffs do Nordeste

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function gerarPlayoffsNordesteEspecifico() {
    try {
        console.log('🌵 GERANDO PLAYOFFS ESPECÍFICOS DO NORDESTE\n')

        // 1. Buscar Superliga
        const superliga = await prisma.campeonato.findFirst({
            where: { temporada: '2025', isSuperliga: true }
        })

        if (!superliga) {
            throw new Error('Superliga 2025 não encontrada')
        }

        // 2. Buscar Conferência Nordeste
        const conferenciaNordeste = await prisma.conferencia.findFirst({
            where: {
                campeonatoId: superliga.id,
                tipo: 'NORDESTE'
            }
        })

        if (!conferenciaNordeste) {
            throw new Error('Conferência Nordeste não encontrada')
        }

        console.log(`✅ Conferência Nordeste encontrada: ${conferenciaNordeste.nome} (ID: ${conferenciaNordeste.id})`)

        // 3. Verificar se já existem playoffs
        const playoffsExistentes = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id
            }
        })

        if (playoffsExistentes.length > 0) {
            console.log(`⚠️  Playoffs Nordeste já existem (${playoffsExistentes.length} jogos)`)
            console.log('   Removendo playoffs existentes...')
            
            await prisma.playoffJogo.deleteMany({
                where: {
                    campeonatoId: superliga.id,
                    conferenciaId: conferenciaNordeste.id
                }
            })
            
            console.log('   ✅ Playoffs antigos removidos')
        }

        // 4. Calcular classificação
        const { calcularClassificacaoPorConferencia } = await import('../src/utils/distribuicaoUtils')
        const classificacao = await calcularClassificacaoPorConferencia(superliga.id)
        
        const nordeste = classificacao['NORDESTE']
        if (!nordeste || !Array.isArray(nordeste) || nordeste.length === 0) {
            throw new Error('Classificação da Conferência Nordeste não encontrada')
        }

        const atlantico = nordeste[0]
        const times = atlantico.times

        if (times.length < 6) {
            throw new Error(`Regional Atlântico deve ter 6 times, encontrados ${times.length}`)
        }

        console.log('📋 Classificação Final Regional Atlântico:')
        times.forEach((time: any, index: number) => {
            console.log(`   ${index + 1}º. ${time.time.nome} (${time.vitorias}V-${time.derrotas}D, ${time.pontosPro} pts)`)
        })

        const primeiro = times[0]   // 1º lugar -> Semifinal direta
        const segundo = times[1]    // 2º lugar -> Semifinal direta  
        const terceiro = times[2]   // 3º lugar -> Semifinal
        const quarto = times[3]     // 4º lugar -> Wild Card
        const quinto = times[4]     // 5º lugar -> Wild Card
        // 6º lugar eliminado

        // 5. CRIAR WILD CARD (4º vs 5º)
        console.log('\n🃏 Criando Wild Card...')
        const wildcard = await prisma.playoffJogo.create({
            data: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id,
                timeClassificado1Id: quarto.time.id,
                timeClassificado2Id: quinto.time.id,
                fase: 'WILD CARD',
                rodada: 1,
                dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '4º Atlântico × 5º Atlântico'
            }
        })

        console.log(`✅ Wild Card criado: ${quarto.time.nome} × ${quinto.time.nome}`)

        // 6. CRIAR SEMIFINAIS
        console.log('\n🏅 Criando Semifinais...')
        
        const semifinal1 = await prisma.playoffJogo.create({
            data: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id,
                timeClassificado1Id: primeiro.time.id,
                timeClassificado2Id: terceiro.time.id, // 3º lugar vai direto
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '1º Atlântico × 3º Atlântico'
            }
        })

        const semifinal2 = await prisma.playoffJogo.create({
            data: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id,
                timeClassificado1Id: segundo.time.id,
                timeClassificado2Id: null, // Vencedor do Wild Card
                fase: 'SEMIFINAL CONFERENCIA',
                rodada: 2,
                dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: '2º Atlântico × Vencedor Wild Card'
            }
        })

        console.log(`✅ Semifinal 1: ${primeiro.time.nome} × ${terceiro.time.nome}`)
        console.log(`✅ Semifinal 2: ${segundo.time.nome} × Vencedor Wild Card`)

        // 7. CRIAR FINAL
        console.log('\n🏆 Criando Final de Conferência...')
        
        const final = await prisma.playoffJogo.create({
            data: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id,
                timeClassificado1Id: null, // Vencedor Semifinal 1
                timeClassificado2Id: null, // Vencedor Semifinal 2
                fase: 'FINAL CONFERENCIA',
                rodada: 1,
                dataJogo: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                status: 'AGUARDANDO',
                nome: 'Final Conferência Nordeste'
            }
        })

        console.log('✅ Final da Conferência Nordeste criada')

        // 8. VERIFICAR RESULTADO
        const playoffsCriados = await prisma.playoffJogo.findMany({
            where: {
                campeonatoId: superliga.id,
                conferenciaId: conferenciaNordeste.id
            }
        })

        console.log(`\n🎉 PLAYOFFS NORDESTE GERADOS COM SUCESSO!`)
        console.log(`   Wild Cards: 1`)
        console.log(`   Semifinais: 2`) 
        console.log(`   Final: 1`)
        console.log(`   Total: ${playoffsCriados.length} jogos`)

        // 9. VERIFICAR STATUS GERAL
        const playoffsTodasConferencias = await prisma.playoffJogo.findMany({
            where: { campeonatoId: superliga.id },
            include: { conferencia: true }
        })

        const playoffsPorConferencia: Record<string, number> = {}
        playoffsTodasConferencias.forEach(p => {
            const conf = p.conferencia?.tipo || 'SEM_CONFERENCIA'
            playoffsPorConferencia[conf] = (playoffsPorConferencia[conf] || 0) + 1
        })

        console.log(`\n📊 STATUS FINAL DE TODOS OS PLAYOFFS:`)
        Object.entries(playoffsPorConferencia).forEach(([conf, count]) => {
            console.log(`   ${conf}: ${count} jogos`)
        })

        console.log(`\n✅ Agora todas as 4 conferências devem aparecer no frontend!`)

    } catch (error) {
        console.error('❌ Erro ao gerar playoffs Nordeste:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    gerarPlayoffsNordesteEspecifico()
        .then(() => {
            console.log('\n🔚 Geração de playoffs Nordeste concluída.')
            process.exit(0)
        })
        .catch(error => {
            console.error('\n💥 Erro durante geração:', error)
            process.exit(1)
        })
}

export default gerarPlayoffsNordesteEspecifico