// scripts/gerar-resultados-fake.ts
// Script para gerar resultados fictícios para todos os jogos da temporada regular
// Executar: npx ts-node scripts/gerar-resultados-fake.ts

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogoFake {
  id_jogo: number
  time_mandante: string
  time_visitante: string
  placar_mandante: number
  placar_visitante: number
  estadio: string
  status: string
}

// Função para gerar placar realista de futebol americano
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  // Placares típicos do futebol americano (múltiplos de 3 e 7, mais alguns de 2)
  const pontosComuns = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42]
  
  const mandante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  const visitante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  
  // Garantir que nem todos os jogos sejam empates
  if (mandante === visitante && Math.random() < 0.8) {
    // 80% de chance de alterar um dos placares se for empate
    const incremento = Math.random() < 0.5 ? 3 : 7 // Field Goal ou Touchdown
    if (Math.random() < 0.5) {
      return { mandante: mandante + incremento, visitante }
    } else {
      return { mandante, visitante: visitante + incremento }
    }
  }
  
  return { mandante, visitante }
}

async function gerarResultadosFake(): Promise<void> {
  console.log('🎲 INICIANDO GERAÇÃO DE RESULTADOS FICTÍCIOS...\n')

  try {
    // 1. Buscar Superliga 2025
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: '2025',
        isSuperliga: true
      }
    })

    if (!superliga) {
      console.error('❌ Superliga 2025 não encontrada!')
      console.log('Execute primeiro: npm run create-superliga')
      return
    }

    console.log(`✅ Superliga encontrada: ${superliga.nome}`)

    // 2. Buscar todos os jogos da temporada regular
    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR'
      },
      include: {
        timeCasa: true,
        timeVisitante: true
      },
      orderBy: [
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ]
    })

    if (jogos.length === 0) {
      console.error('❌ Nenhum jogo encontrado na temporada regular!')
      console.log('Execute primeiro a importação da agenda de jogos.')
      return
    }

    console.log(`📋 Encontrados ${jogos.length} jogos na temporada regular`)

    // 3. Gerar resultados fictícios
    const resultadosFake: JogoFake[] = []
    let jogosComResultado = 0

    for (const jogo of jogos) {
      // Verificar se já tem resultado
      if (jogo.status === 'FINALIZADO' && jogo.placarCasa !== null && jogo.placarVisitante !== null) {
        console.log(`⏭️  Jogo ${jogo.id} já finalizado: ${jogo.timeCasa.sigla} ${jogo.placarCasa} x ${jogo.placarVisitante} ${jogo.timeVisitante.sigla}`)
        jogosComResultado++
        continue
      }

      // Gerar placar fictício
      const placar = gerarPlacarRealista()
      
      const resultadoFake: JogoFake = {
        id_jogo: jogo.id,
        time_mandante: jogo.timeCasa.nome,
        time_visitante: jogo.timeVisitante.nome,
        placar_mandante: placar.mandante,
        placar_visitante: placar.visitante,
        estadio: jogo.local || jogo.timeCasa.estadio || `Estádio ${jogo.timeCasa.cidade}`,
        status: 'FINALIZADO'
      }

      resultadosFake.push(resultadoFake)

      console.log(`🎯 Jogo ${jogo.id} (R${jogo.rodada}): ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
    }

    // 4. Estatísticas
    console.log('\n📊 ESTATÍSTICAS DOS RESULTADOS GERADOS:')
    console.log(`   📥 Total de jogos: ${jogos.length}`)
    console.log(`   ✅ Já finalizados: ${jogosComResultado}`)
    console.log(`   🎲 Novos resultados: ${resultadosFake.length}`)

    if (resultadosFake.length === 0) {
      console.log('\n🎉 Todos os jogos já possuem resultados!')
      return
    }

    // 5. Gerar planilha Excel
    const outputDir = path.join(process.cwd(), 'planilhas-geradas')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputFile = path.join(outputDir, `resultados-fake-${new Date().toISOString().split('T')[0]}.xlsx`)

    // Criar workbook
    const workbook = XLSX.utils.book_new()

    // Criar worksheet com os dados
    const worksheet = XLSX.utils.json_to_sheet(resultadosFake)

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS_FAKE')

    // Salvar arquivo
    XLSX.writeFile(workbook, outputFile)

    console.log(`\n💾 Planilha gerada: ${outputFile}`)

    // 6. Analisar distribuição de placares
    const placaresMandante = resultadosFake.map(r => r.placar_mandante)
    const placaresVisitante = resultadosFake.map(r => r.placar_visitante)
    
    const vitoriasMandante = resultadosFake.filter(r => r.placar_mandante > r.placar_visitante).length
    const vitoriasVisitante = resultadosFake.filter(r => r.placar_visitante > r.placar_mandante).length
    const empates = resultadosFake.filter(r => r.placar_mandante === r.placar_visitante).length

    console.log('\n📈 ANÁLISE DOS RESULTADOS:')
    console.log(`   🏠 Vitórias mandante: ${vitoriasMandante} (${(vitoriasMandante/resultadosFake.length*100).toFixed(1)}%)`)
    console.log(`   ✈️  Vitórias visitante: ${vitoriasVisitante} (${(vitoriasVisitante/resultadosFake.length*100).toFixed(1)}%)`)
    console.log(`   🤝 Empates: ${empates} (${(empates/resultadosFake.length*100).toFixed(1)}%)`)
    
    const mediaMandante = placaresMandante.reduce((a, b) => a + b, 0) / placaresMandante.length
    const mediaVisitante = placaresVisitante.reduce((a, b) => a + b, 0) / placaresVisitante.length
    
    console.log(`   📊 Média mandante: ${mediaMandante.toFixed(1)} pontos`)
    console.log(`   📊 Média visitante: ${mediaVisitante.toFixed(1)} pontos`)

    // 7. Instruções para uso
    console.log('\n🚀 PRÓXIMOS PASSOS:')
    console.log('1. Acesse o painel admin: http://localhost:3001/admin/importar')
    console.log('2. Vá para a aba "Importar Resultados"')
    console.log(`3. Faça upload do arquivo: ${path.basename(outputFile)}`)
    console.log('4. Aguarde a importação e verifique se os playoffs são gerados automaticamente')

    console.log('\n⚠️  IMPORTANTE:')
    console.log('   - Estes são resultados FICTÍCIOS para teste')
    console.log('   - Use apenas para validar o funcionamento do sistema')
    console.log('   - Para resultados reais, importe a planilha oficial')

  } catch (error) {
    console.error('❌ Erro ao gerar resultados fictícios:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Função para aplicar resultados direto no banco (opcional)
async function aplicarResultadosNoBanco(): Promise<void> {
  console.log('\n🔄 APLICANDO RESULTADOS DIRETAMENTE NO BANCO...')

  try {
    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      console.error('❌ Superliga não encontrada!')
      return
    }

    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR',
        status: { not: 'FINALIZADO' }
      }
    })

    let atualizados = 0

    for (const jogo of jogos) {
      const placar = gerarPlacarRealista()

      await prisma.jogo.update({
        where: { id: jogo.id },
        data: {
          placarCasa: placar.mandante,
          placarVisitante: placar.visitante,
          status: 'FINALIZADO'
        }
      })

      atualizados++
      console.log(`✅ Jogo ${jogo.id} atualizado`)
    }

    console.log(`\n🎉 ${atualizados} jogos atualizados no banco de dados!`)

  } catch (error) {
    console.error('❌ Erro ao aplicar resultados no banco:', error)
    throw error
  }
}

// Função principal
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  
  if (args.includes('--apply-direct') || args.includes('-d')) {
    await aplicarResultadosNoBanco()
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('📖 USO DO SCRIPT:')
    console.log('')
    console.log('  npm run generate-fake-results        # Gerar planilha Excel')
    console.log('  npm run generate-fake-results -d     # Aplicar direto no banco')
    console.log('  npm run generate-fake-results --help # Mostrar esta ajuda')
    console.log('')
    console.log('🔍 O que cada comando faz:')
    console.log('  Planilha: Gera arquivo Excel para importar via interface')
    console.log('  Direto: Aplica resultados diretamente no banco (mais rápido)')
  } else {
    await gerarResultadosFake()
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n🔚 Script concluído.')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro durante execução:', error)
      process.exit(1)
    })
}

export default gerarResultadosFake