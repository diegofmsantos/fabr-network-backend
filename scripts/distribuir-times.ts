// Executar: npx ts-node scripts/populate-distribuicao-inicial.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ DISTRIBUIÇÃO BASEADA NO BRIEFING DA SUPERLIGA
const DISTRIBUICAO_SUPERLIGA = {
  'SUDESTE': {
    nome: 'Conferência Sudeste',
    icone: '🏭',
    regionais: {
      'SERRAMAR': {
        nome: 'Regional Serramar',
        times: ['Vasco Almirantes', 'Flamengo Imperadores', 'Locomotiva FA', 'Tritões FA']
      },
      'CANASTRA': {
        nome: 'Regional Canastra', 
        times: ['Galo FA', 'Moura Lacerda Dragons', 'Rio Preto Weilers', 'Spartans FA']
      },
      'CANTAREIRA': {
        nome: 'Regional Cantareira',
        times: ['Corinthians Steamrollers', 'Cruzeiro FA', 'Guarulhos Rhynos', 'Ocelots FA']
      }
    }
  },
  'SUL': {
    nome: 'Conferência Sul',
    icone: '🧊',
    regionais: {
      'ARAUCARIA': {
        nome: 'Regional Araucária',
        times: ['Timbó Rex', 'Coritiba Crocodiles', 'Calvary Cavaliers', 'Brown Spiders']
      },
      'PAMPA': {
        nome: 'Regional Pampa',
        times: ['Santa Maria Soldiers', 'Juventude FA', 'Bravos FA', 'Istepôs FA']
      }
    }
  },
  'NORDESTE': {
    nome: 'Conferência Nordeste',
    icone: '🌵',
    regionais: {
      'ATLANTICO': {
        nome: 'Regional Atlântico',
        times: ['Fortaleza Tritões', 'Ceará Sabres', 'João Pessoa Espectros', 'Recife Mariners', 'Cavalaria 2 de Julho', 'Caruaru Wolves']
      }
    }
  },
  'CENTRO NORTE': {
    nome: 'Conferência Centro-Norte',
    icone: '🌲',
    regionais: {
      'CERRADO': {
        nome: 'Regional Cerrado',
        times: ['Rondonópolis Hawks', 'Cuiabá Arsenal', 'Tubarões do Cerrado']
      },
      'AMAZONIA': {
        nome: 'Regional Amazônia',
        times: ['Porto Velho Miners', 'Manaus FA', 'Manaus Cavaliers']
      }
    }
  }
};

async function distribuirTimes() {
  try {
    console.log('🚀 Iniciando população da distribuição inicial...');

    // 1. Buscar a Superliga 2025
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

    if (!superliga) {
      console.log('❌ Superliga 2025 não encontrada. Execute primeiro a criação da Superliga.');
      return;
    }

    console.log(`✅ Superliga encontrada: ${superliga.nome}`);

    // 2. Verificar se já existe distribuição
    const distribuicaoExistente = await prisma.distribuicaoTime.findFirst({
      where: { campeonatoId: superliga.id }
    });

    if (distribuicaoExistente) {
      console.log('⚠️  Distribuição já existe. Limpando dados antigos...');
      await prisma.distribuicaoTime.deleteMany({
        where: { campeonatoId: superliga.id }
      });
    }

    // 3. Buscar todos os times da temporada 2025
    const times = await prisma.time.findMany({
      where: { temporada: '2025' }
    });

    console.log(`📋 Encontrados ${times.length} times na temporada 2025`);

    let totalDistribuidos = 0;
    const erros: string[] = [];

    // 4. Distribuir times por conferência/regional
    for (const [confTipo, confData] of Object.entries(DISTRIBUICAO_SUPERLIGA)) {
      console.log(`\n🏆 Processando ${confData.nome}...`);

      // Buscar conferência
      const conferencia = superliga.conferencias.find(c => c.tipo === confTipo);
      if (!conferencia) {
        erros.push(`Conferência ${confTipo} não encontrada`);
        continue;
      }

      // Processar regionais
      for (const [regTipo, regData] of Object.entries(confData.regionais)) {
        console.log(`  📍 Processando ${regData.nome}...`);

        // Buscar regional
        const regional = conferencia.regionais.find(r => r.tipo === regTipo);
        if (!regional) {
          erros.push(`Regional ${regTipo} não encontrado na conferência ${confTipo}`);
          continue;
        }

        // Distribuir times
        for (const nomeTime of regData.times) {
          const time = times.find(t => t.nome === nomeTime);
          if (!time) {
            erros.push(`Time "${nomeTime}" não encontrado no banco de dados`);
            continue;
          }

          // Criar distribuição
          await prisma.distribuicaoTime.create({
            data: {
              campeonatoId: superliga.id,
              conferenciaId: conferencia.id,
              regionalId: regional.id,
              timeId: time.id,
              temporada: '2025',
              conferenciaType: confTipo,
              regionalType: regTipo
            }
          });

          console.log(`    ✅ ${time.nome} -> ${regData.nome}`);
          totalDistribuidos++;
        }
      }
    }

    // 5. Relatório final
    console.log('\n📊 RELATÓRIO FINAL:');
    console.log(`✅ Times distribuídos: ${totalDistribuidos}`);
    console.log(`❌ Erros encontrados: ${erros.length}`);

    if (erros.length > 0) {
      console.log('\n🚨 ERROS:');
      erros.forEach(erro => console.log(`  - ${erro}`));
    }

    // 6. Verificação da distribuição
    const verificacao = await prisma.distribuicaoTime.groupBy({
      by: ['conferenciaType'],
      _count: { timeId: true },
      where: { campeonatoId: superliga.id }
    });

    console.log('\n🔍 VERIFICAÇÃO POR CONFERÊNCIA:');
    verificacao.forEach(v => {
      console.log(`  ${v.conferenciaType}: ${v._count.timeId} times`);
    });

    // 7. Atualizar jogos existentes com informações de conferência/regional
    console.log('\n🔄 Atualizando jogos existentes...');
    
    const jogos = await prisma.jogo.findMany({
      where: { campeonatoId: superliga.id },
      include: { timeCasa: true, timeVisitante: true }
    });

    for (const jogo of jogos) {
      // Buscar distribuição do time da casa
      const distCasa = await prisma.distribuicaoTime.findFirst({
        where: {
          campeonatoId: superliga.id,
          timeId: jogo.timeCasaId
        }
      });

      if (distCasa) {
        await prisma.jogo.update({
          where: { id: jogo.id },
          data: {
            conferencia: distCasa.conferenciaType,
            regional: distCasa.regionalType,
            temporada: '2025'
          }
        });
      }
    }

    console.log(`🎉 Distribuição inicial completada com sucesso!`);

  } catch (error) {
    console.error('❌ Erro ao popular distribuição:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  distribuirTimes();
}

export default distribuirTimes;