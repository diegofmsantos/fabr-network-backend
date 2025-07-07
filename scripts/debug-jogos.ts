// scripts/debug-jogos.ts
// Script para debugar e verificar jogos no banco de dados
// Executar: npx ts-node scripts/debug-jogos.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugJogos(): Promise<void> {
  console.log('🔍 DEBUGANDO JOGOS NO BANCO DE DADOS...\n')

  try {
    // 1. Buscar Superliga
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: '2025',
        isSuperliga: true
      }
    })

    if (!superliga) {
      console.error('❌ Superliga 2025 não encontrada!')
      return
    }

    console.log(`✅ Superliga encontrada: ${superliga.nome} (ID: ${superliga.id})`)

    // 2. Contar TODOS os jogos da Superliga
    const totalJogos = await prisma.jogo.count({
      where: { campeonatoId: superliga.id }
    })

    console.log(`📊 Total de jogos na Superliga: ${totalJogos}`)

    if (totalJogos === 0) {
      console.log('❌ Nenhum jogo encontrado! Verifique se a agenda foi importada corretamente.')
      return
    }

    // 3. Verificar valores da coluna 'fase'
    const jogosPorFase = await prisma.jogo.groupBy({
      by: ['fase'],
      where: { campeonatoId: superliga.id },
      _count: { fase: true }
    })

    console.log('\n📋 JOGOS POR FASE:')
    jogosPorFase.forEach(grupo => {
      console.log(`   "${grupo.fase}": ${grupo._count.fase} jogos`)
    })

    // 4. Verificar valores da coluna 'status'
    const jogosPorStatus = await prisma.jogo.groupBy({
      by: ['status'],
      where: { campeonatoId: superliga.id },
      _count: { status: true }
    })

    console.log('\n📋 JOGOS POR STATUS:')
    jogosPorStatus.forEach(grupo => {
      console.log(`   "${grupo.status}": ${grupo._count.status} jogos`)
    })

    // 5. Verificar valores da coluna 'rodada'
    const jogosPorRodada = await prisma.jogo.groupBy({
      by: ['rodada'],
      where: { campeonatoId: superliga.id },
      _count: { rodada: true },
      orderBy: { rodada: 'asc' }
    })

    console.log('\n📋 JOGOS POR RODADA:')
    jogosPorRodada.forEach(grupo => {
      console.log(`   Rodada ${grupo.rodada}: ${grupo._count.rodada} jogos`)
    })

    // 6. Verificar conferências
    const jogosPorConferencia = await prisma.jogo.groupBy({
      by: ['conferencia'],
      where: { campeonatoId: superliga.id },
      _count: { conferencia: true }
    })

    console.log('\n📋 JOGOS POR CONFERÊNCIA:')
    jogosPorConferencia.forEach(grupo => {
      console.log(`   "${grupo.conferencia || 'NULL'}": ${grupo._count.conferencia} jogos`)
    })

    // 7. Mostrar alguns jogos de exemplo
    const jogosExemplo = await prisma.jogo.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        timeCasa: { select: { nome: true, sigla: true } },
        timeVisitante: { select: { nome: true, sigla: true } }
      },
      take: 5,
      orderBy: { id: 'asc' }
    })

    console.log('\n📝 EXEMPLOS DE JOGOS:')
    jogosExemplo.forEach((jogo, index) => {
      console.log(`   ${index + 1}. ID:${jogo.id} | ${jogo.timeCasa.sigla} vs ${jogo.timeVisitante.sigla} | Fase:"${jogo.fase}" | Rodada:${jogo.rodada} | Status:"${jogo.status}"`)
    })

    // 8. Verificar problemas específicos
    console.log('\n🔍 DIAGNÓSTICO:')

    // Verificar se algum jogo tem fase 'TEMPORADA_REGULAR'
    const jogosTemporadaRegular = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR'
      }
    })

    if (jogosTemporadaRegular > 0) {
      console.log(`✅ Encontrados ${jogosTemporadaRegular} jogos com fase 'TEMPORADA_REGULAR'`)
    } else {
      console.log(`❌ Nenhum jogo com fase 'TEMPORADA_REGULAR' encontrado!`)
      
      // Verificar se tem com 'Temporada Regular' (da planilha)
      const jogosTemporadaRegularAlt = await prisma.jogo.count({
        where: {
          campeonatoId: superliga.id,
          fase: 'Temporada Regular'
        }
      })

      if (jogosTemporadaRegularAlt > 0) {
        console.log(`✅ Mas encontrados ${jogosTemporadaRegularAlt} jogos com fase 'Temporada Regular'`)
        console.log(`💡 SOLUÇÃO: Atualizar valor da fase de 'Temporada Regular' para 'TEMPORADA_REGULAR'`)
      }
    }

    // Verificar se jogos têm conferência/regional
    const jogosSemConferencia = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        conferencia: null
      }
    })

    if (jogosSemConferencia > 0) {
      console.log(`⚠️  ${jogosSemConferencia} jogos sem conferência definida`)
    } else {
      console.log(`✅ Todos os jogos têm conferência definida`)
    }

    // 9. Sugestões de correção
    console.log('\n🔧 POSSÍVEIS SOLUÇÕES:')

    if (jogosTemporadaRegular === 0 && totalJogos > 0) {
      console.log('1. Corrigir valor da coluna fase:')
      console.log(`   UPDATE "Jogo" SET fase = 'TEMPORADA_REGULAR' WHERE fase = 'Temporada Regular' AND "campeonatoId" = ${superliga.id};`)
    }

    if (jogosSemConferencia > 0) {
      console.log('2. Executar novamente o script de distribuição:')
      console.log('   npx ts-node scripts/populate-distribuicao-inicial.ts')
    }

    console.log('3. Verificar se agenda foi importada com dados corretos')
    console.log('4. Re-importar agenda se necessário')

  } catch (error) {
    console.error('❌ Erro durante debug:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Função para corrigir automaticamente
async function corrigirFaseJogos(): Promise<void> {
  console.log('🔧 CORRIGINDO FASE DOS JOGOS...\n')

  try {
    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      console.error('❌ Superliga não encontrada!')
      return
    }

    // Corrigir fase de 'Temporada Regular' para 'TEMPORADA_REGULAR'
    const resultado = await prisma.jogo.updateMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'Temporada Regular'
      },
      data: {
        fase: 'TEMPORADA_REGULAR'
      }
    })

    console.log(`✅ ${resultado.count} jogos corrigidos de 'Temporada Regular' para 'TEMPORADA_REGULAR'`)

    // Verificar resultado
    const jogosCorrigidos = await prisma.jogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR'
      }
    })

    console.log(`✅ Agora existem ${jogosCorrigidos} jogos com fase 'TEMPORADA_REGULAR'`)

  } catch (error) {
    console.error('❌ Erro ao corrigir jogos:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Função principal
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  
  if (args.includes('--fix') || args.includes('-f')) {
    await corrigirFaseJogos()
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('📖 USO DO SCRIPT:')
    console.log('')
    console.log('  npx ts-node scripts/debug-jogos.ts        # Debug dos jogos')
    console.log('  npx ts-node scripts/debug-jogos.ts --fix  # Corrigir fase automaticamente')
    console.log('  npx ts-node scripts/debug-jogos.ts --help # Mostrar esta ajuda')
    console.log('')
  } else {
    await debugJogos()
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n🔚 Debug concluído.')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro durante debug:', error)
      process.exit(1)
    })
}

export default debugJogos