// scripts/verificar-times-cadastrados.ts
// Script para verificar quais times estão cadastrados e comparar com o briefing
// Executar: npx ts-node scripts/verificar-times-cadastrados.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Times esperados conforme briefing
const TIMES_ESPERADOS = {
  'SUDESTE': {
    'SERRAMAR': ['Vasco Almirantes', 'Flamengo Imperadores', 'Locomotiva FA', 'Tritões FA'],
    'CANASTRA': ['Galo FA', 'Moura Lacerda Dragons', 'Rio Preto Weilers', 'Spartans FA'],
    'CANTAREIRA': ['Corinthians Steamrollers', 'Cruzeiro FA', 'Guarulhos Rhynos', 'Ocelots FA']
  },
  'SUL': {
    'ARAUCARIA': ['Timbó Rex', 'Coritiba Crocodiles', 'Calvary Cavaliers', 'Brown Spiders'],
    'PAMPA': ['Santa Maria Soldiers', 'Juventude FA', 'Bravos FA', 'Istepôs FA']
  },
  'NORDESTE': {
    'ATLANTICO': ['Fortaleza Tritões', 'Ceará Sabres', 'João Pessoa Espectros', 'Recife Mariners', 'Cavalaria 2 de Julho', 'Caruaru Wolves']
  },
  'CENTRO_NORTE': {
    'CERRADO': ['Rondonópolis Hawks', 'Cuiabá Arsenal', 'Tubarões do Cerrado'],
    'AMAZONIA': ['Porto Velho Miners', 'Manaus FA', 'Manaus Cavaliers']
  }
};

async function verificarTimesCadastrados() {
  try {
    console.log('🔍 VERIFICANDO TIMES CADASTRADOS vs BRIEFING\n');

    // Buscar todos os times da temporada 2025
    const timesCadastrados = await prisma.time.findMany({
      where: { temporada: '2025' },
      select: { id: true, nome: true, sigla: true },
      orderBy: { nome: 'asc' }
    });

    console.log(`📊 Total de times cadastrados: ${timesCadastrados.length}`);
    console.log('═'.repeat(80));

    // Verificar cada conferência
    for (const [conferencia, regionais] of Object.entries(TIMES_ESPERADOS)) {
      console.log(`\n🏆 CONFERÊNCIA ${conferencia}:`);
      
      for (const [regional, timesEsperados] of Object.entries(regionais)) {
        console.log(`\n  📍 Regional ${regional} (esperados: ${timesEsperados.length}):`);
        
        const timesEncontrados: string[] = [];
        const timesFaltando: string[] = [];
        
        for (const nomeEsperado of timesEsperados) {
          const timeEncontrado = timesCadastrados.find(t => 
            t.nome.toLowerCase().trim() === nomeEsperado.toLowerCase().trim()
          );
          
          if (timeEncontrado) {
            timesEncontrados.push(timeEncontrado.nome);
            console.log(`    ✅ ${timeEncontrado.nome} (ID: ${timeEncontrado.id})`);
          } else {
            timesFaltando.push(nomeEsperado);
            console.log(`    ❌ ${nomeEsperado} - NÃO ENCONTRADO`);
          }
        }
        
        console.log(`    📈 Resultado: ${timesEncontrados.length}/${timesEsperados.length} encontrados`);
        
        if (timesFaltando.length > 0) {
          console.log(`    🔍 Possíveis correspondências:`);
          
          // Buscar times similares
          for (const timeFaltando of timesFaltando) {
            const palavrasChave = timeFaltando.toLowerCase().split(' ');
            const possiveisCorrespondencias = timesCadastrados.filter(t => {
              const nomeTime = t.nome.toLowerCase();
              return palavrasChave.some(palavra => 
                palavra.length > 2 && nomeTime.includes(palavra)
              );
            });
            
            if (possiveisCorrespondencias.length > 0) {
              console.log(`      "${timeFaltando}" pode ser:`);
              possiveisCorrespondencias.forEach(t => {
                console.log(`        - ${t.nome} (ID: ${t.id})`);
              });
            }
          }
        }
      }
    }

    // Mostrar times que não estão no briefing
    console.log('\n' + '═'.repeat(80));
    console.log('🔄 TIMES CADASTRADOS NÃO MAPEADOS NO BRIEFING:');
    
    const todosTimesEsperados = Object.values(TIMES_ESPERADOS)
      .flatMap(regionais => Object.values(regionais))
      .flat();
    
    const timesNaoMapeados = timesCadastrados.filter(t => 
      !todosTimesEsperados.some(esperado => 
        esperado.toLowerCase().trim() === t.nome.toLowerCase().trim()
      )
    );
    
    if (timesNaoMapeados.length > 0) {
      timesNaoMapeados.forEach(t => {
        console.log(`  🔸 ${t.nome} (ID: ${t.id})`);
      });
    } else {
      console.log('  ✅ Todos os times cadastrados estão mapeados!');
    }

    // Resumo final
    console.log('\n' + '═'.repeat(80));
    console.log('📊 RESUMO FINAL:');
    console.log(`   📥 Times cadastrados: ${timesCadastrados.length}`);
    console.log(`   📋 Times esperados: ${todosTimesEsperados.length}`);
    console.log(`   ❌ Times não mapeados: ${timesNaoMapeados.length}`);
    
    const percentualMatch = ((todosTimesEsperados.length - timesNaoMapeados.length) / todosTimesEsperados.length) * 100;
    console.log(`   📈 Taxa de correspondência: ${percentualMatch.toFixed(1)}%`);

    if (percentualMatch === 100) {
      console.log('\n🎉 PERFEITO! Todos os times estão corretos para distribuição automática!');
    } else {
      console.log('\n⚠️  AÇÃO NECESSÁRIA:');
      console.log('   1. Verifique os nomes dos times na planilha');
      console.log('   2. Corrija os nomes ou crie uma distribuição manual');
      console.log('   3. OU execute o script de distribuição flexível');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar times:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  verificarTimesCadastrados();
}

export default verificarTimesCadastrados;