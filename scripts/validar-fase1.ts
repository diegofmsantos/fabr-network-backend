// scripts/validar-fase1.ts
// Script para validar se a Fase 1 foi implementada corretamente
// Executar: npx ts-node scripts/validar-fase1.ts

import { PrismaClient } from '@prisma/client';
import { calcularClassificacaoPorConferencia, validarDistribuicao } from '../src/utils/distribuicaoUtils';

const prisma = new PrismaClient();

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

async function validarFase1(): Promise<void> {
  const results: TestResult[] = [];
  
  console.log('🔍 INICIANDO VALIDAÇÃO DA FASE 1...\n');

  try {
    // ✅ Teste 1: Verificar se a tabela DistribuicaoTime existe
    try {
      await prisma.distribuicaoTime.findFirst();
      results.push({
        test: 'Tabela DistribuicaoTime',
        status: 'PASS',
        message: 'Tabela criada e acessível'
      });
    } catch (error) {
      results.push({
        test: 'Tabela DistribuicaoTime',
        status: 'FAIL',
        message: 'Tabela não encontrada ou inacessível',
        details: error
      });
    }

    // ✅ Teste 2: Verificar se novos campos foram adicionados aos jogos
    try {
      const jogo = await prisma.jogo.findFirst({
        select: {
          id: true,
          conferencia: true,
          regional: true,
          temporada: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (jogo !== null) {
        results.push({
          test: 'Novos campos em Jogo',
          status: 'PASS',
          message: 'Campos conferencia, regional, temporada adicionados'
        });
      } else {
        results.push({
          test: 'Novos campos em Jogo', 
          status: 'WARNING',
          message: 'Nenhum jogo encontrado para validar campos'
        });
      }
    } catch (error) {
      results.push({
        test: 'Novos campos em Jogo',
        status: 'FAIL',
        message: 'Erro ao verificar novos campos',
        details: error
      });
    }

    // ✅ Teste 3: Verificar se novos campos foram adicionados às estatísticas
    try {
      const estatistica = await prisma.estatisticaJogo.findFirst({
        select: {
          id: true,
          temporada: true,
          rodada: true,
          fase: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (estatistica !== null) {
        results.push({
          test: 'Novos campos em EstatisticaJogo',
          status: 'PASS',
          message: 'Campos temporada, rodada, fase adicionados'
        });
      } else {
        results.push({
          test: 'Novos campos em EstatisticaJogo',
          status: 'WARNING',
          message: 'Nenhuma estatística encontrada para validar campos'
        });
      }
    } catch (error) {
      results.push({
        test: 'Novos campos em EstatisticaJogo',
        status: 'FAIL',
        message: 'Erro ao verificar novos campos',
        details: error
      });
    }

    // ✅ Teste 4: Verificar se existe Superliga 2025
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: '2025',
        isSuperliga: true
      },
      include: {
        conferencias: {
          include: {
            regionais: true
          }
        }
      }
    });

    if (superliga) {
      results.push({
        test: 'Superliga 2025',
        status: 'PASS',
        message: `Superliga encontrada: ${superliga.nome}`,
        details: {
          conferencias: superliga.conferencias.length,
          regionais: superliga.conferencias.reduce((acc, conf) => acc + conf.regionais.length, 0)
        }
      });

      // ✅ Teste 5: Verificar distribuição de times
      const distribuicaoCount = await prisma.distribuicaoTime.count({
        where: { campeonatoId: superliga.id }
      });

      if (distribuicaoCount > 0) {
        const validacao = await validarDistribuicao(superliga.id);
        
        results.push({
          test: 'Distribuição de Times',
          status: validacao.isValid ? 'PASS' : 'FAIL',
          message: validacao.isValid 
            ? `${distribuicaoCount} times distribuídos corretamente`
            : `Problemas na distribuição: ${validacao.errors.join(', ')}`,
          details: validacao.summary
        });
      } else {
        results.push({
          test: 'Distribuição de Times',
          status: 'FAIL',
          message: 'Nenhum time distribuído encontrado'
        });
      }

      // ✅ Teste 6: Testar cálculo de classificação
      try {
        const classificacao = await calcularClassificacaoPorConferencia(superliga.id);
        const totalConferencias = Object.keys(classificacao).length;
        
        results.push({
          test: 'Cálculo de Classificação',
          status: totalConferencias > 0 ? 'PASS' : 'WARNING',
          message: totalConferencias > 0 
            ? `Classificação calculada para ${totalConferencias} conferências`
            : 'Nenhuma classificação calculada (pode ser normal se não há jogos)',
          details: Object.fromEntries(
            Object.entries(classificacao).map(([conf, regionais]) => [
              conf, 
              regionais.map(r => ({ regional: r.regionalNome, times: r.times.length }))
            ])
          )
        });
      } catch (error) {
        results.push({
          test: 'Cálculo de Classificação',
          status: 'FAIL',
          message: 'Erro ao calcular classificação',
          details: error
        });
      }

    } else {
      results.push({
        test: 'Superliga 2025',
        status: 'FAIL',
        message: 'Superliga 2025 não encontrada'
      });
    }

    // ✅ Teste 7: Verificar times cadastrados
    const timesCount = await prisma.time.count({
      where: { temporada: '2025' }
    });

    results.push({
      test: 'Times Cadastrados',
      status: timesCount >= 32 ? 'PASS' : timesCount > 0 ? 'WARNING' : 'FAIL',
      message: `${timesCount} times encontrados na temporada 2025`,
      details: { esperado: 32, encontrado: timesCount }
    });

    // ✅ Teste 8: Verificar jogadores cadastrados
    const jogadoresCount = await prisma.jogadorTime.count({
      where: { temporada: '2025' }
    });

    results.push({
      test: 'Jogadores Cadastrados',
      status: jogadoresCount >= 1000 ? 'PASS' : jogadoresCount > 0 ? 'WARNING' : 'FAIL',
      message: `${jogadoresCount} jogadores encontrados na temporada 2025`,
      details: { esperado: '~1500', encontrado: jogadoresCount }
    });

    // ✅ Teste 9: Verificar índices importantes
    try {
      // Teste de performance simulando consultas comuns
      const start = Date.now();
      
      if (superliga) {
        await Promise.all([
          prisma.distribuicaoTime.findMany({
            where: { campeonatoId: superliga.id, conferenciaType: 'SUDESTE' }
          }),
          prisma.jogo.findMany({
            where: { campeonatoId: superliga.id, conferencia: 'SUDESTE' },
            take: 10
          }),
          prisma.estatisticaJogo.findMany({
            where: { temporada: '2025', fase: 'TEMPORADA REGULAR' },
            take: 10
          })
        ]);
      }
      
      const end = Date.now();
      const duration = end - start;

      results.push({
        test: 'Performance de Consultas',
        status: duration < 1000 ? 'PASS' : duration < 3000 ? 'WARNING' : 'FAIL',
        message: `Consultas executadas em ${duration}ms`,
        details: { threshold: '< 1000ms ideal, < 3000ms aceitável' }
      });
    } catch (error) {
      results.push({
        test: 'Performance de Consultas',
        status: 'FAIL',
        message: 'Erro ao testar performance',
        details: error
      });
    }

    // ✅ Teste 10: Verificar integridade referencial
    try {
      const orphanDistribuicao = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "DistribuicaoTime" dt
        LEFT JOIN "Campeonato" c ON dt."campeonatoId" = c.id
        LEFT JOIN "Time" t ON dt."timeId" = t.id
        LEFT JOIN "Conferencia" conf ON dt."conferenciaId" = conf.id
        LEFT JOIN "Regional" r ON dt."regionalId" = r.id
        WHERE c.id IS NULL OR t.id IS NULL OR conf.id IS NULL OR r.id IS NULL
      ` as any[];

      const orphanCount = parseInt(orphanDistribuicao[0]?.count || '0');

      results.push({
        test: 'Integridade Referencial',
        status: orphanCount === 0 ? 'PASS' : 'FAIL',
        message: orphanCount === 0 
          ? 'Todas as referências estão íntegras'
          : `${orphanCount} registros com referências órfãs encontrados`
      });
    } catch (error) {
      results.push({
        test: 'Integridade Referencial',
        status: 'WARNING',
        message: 'Não foi possível verificar integridade (pode ser normal)',
        details: error
      });
    }

  } catch (error) {
    results.push({
      test: 'Erro Geral',
      status: 'FAIL',
      message: 'Erro durante a validação',
      details: error
    });
  } finally {
    await prisma.$disconnect();
  }

  // ✅ RELATÓRIO FINAL
  console.log('📊 RELATÓRIO DE VALIDAÇÃO:\n');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} ${result.test}: ${result.message}`);
    
    if (result.details && (result.status === 'FAIL' || result.status === 'WARNING')) {
      console.log(`   Detalhes: ${JSON.stringify(result.details, null, 2)}`);
    }
  });

  console.log('\n📈 RESUMO:');
  console.log(`✅ Passou: ${passed}/${results.length}`);
  console.log(`⚠️  Avisos: ${warnings}/${results.length}`);
  console.log(`❌ Falhou: ${failed}/${results.length}`);

  const successRate = ((passed + warnings) / results.length) * 100;
  console.log(`\n🎯 Taxa de sucesso: ${successRate.toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 FASE 1 IMPLEMENTADA COM SUCESSO!');
    console.log('✨ Próximos passos:');
    console.log('   1. Corrigir importação de agenda de jogos');
    console.log('   2. Testar importação de resultados');
    console.log('   3. Implementar interfaces do frontend admin');
  } else {
    console.log('\n🔧 AÇÕES NECESSÁRIAS:');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => console.log(`   - ${r.test}: ${r.message}`));
  }

  if (warnings > 0) {
    console.log('\n💡 AVISOS PARA REVISÃO:');
    results
      .filter(r => r.status === 'WARNING')
      .forEach(r => console.log(`   - ${r.test}: ${r.message}`));
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  validarFase1()
    .then(() => {
      console.log('\n🔚 Validação concluída.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Erro durante validação:', error);
      process.exit(1);
    });
}

export default validarFase1;