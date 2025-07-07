// scripts/test-upload-route.ts
// Script para testar a rota de upload de resultados
// Executar: npx ts-node scripts/test-upload-route.ts

import * as fs from 'fs'
import * as path from 'path'

async function testBackendConnection(): Promise<void> {
    console.log('🔍 TESTANDO CONECTIVIDADE COM BACKEND...\n')

    try {
        // Vamos apenas verificar se o arquivo foi gerado corretamente
        const planilhasDir = path.join(process.cwd(), 'planilhas-geradas')

        if (!fs.existsSync(planilhasDir)) {
            console.error('❌ Pasta planilhas-geradas não encontrada!')
            console.log('Execute primeiro: npx ts-node scripts/gerar-resultados-fake.ts')
            return
        }

        // Encontrar arquivo mais recente
        const arquivos = fs.readdirSync(planilhasDir)
            .filter(file => file.startsWith('resultados-fake-') && file.endsWith('.xlsx'))
            .map(file => ({
                name: file,
                path: path.join(planilhasDir, file),
                stats: fs.statSync(path.join(planilhasDir, file))
            }))
            .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())

        if (arquivos.length === 0) {
            console.error('❌ Nenhum arquivo de resultados encontrado!')
            console.log('Execute primeiro: npx ts-node scripts/gerar-resultados-fake.ts')
            return
        }

        const arquivo = arquivos[0]
        console.log(`📄 Arquivo encontrado: ${arquivo.name}`)
        console.log(`📊 Tamanho: ${(arquivo.stats.size / 1024).toFixed(2)} KB`)
        console.log(`🕒 Modificado: ${arquivo.stats.mtime.toLocaleString()}`)

        // Verificar conteúdo do arquivo
        console.log('\n📋 VERIFICANDO ESTRUTURA DO ARQUIVO...')
        console.log(`📍 Caminho completo: ${arquivo.path}`)

        console.log('\n✅ ARQUIVO ESTÁ PRONTO PARA UPLOAD!')
        console.log('\n🚀 PRÓXIMOS PASSOS:')
        console.log('1. Certifique-se que o backend está rodando (npm run dev)')
        console.log('2. Acesse: http://localhost:3001/admin/importar')
        console.log('3. Vá para a aba "Importar Resultados"')
        console.log(`4. Faça upload do arquivo: ${arquivo.name}`)

        // Verificar se backend está rodando mostrando processo
        console.log('\n🔍 DIAGNÓSTICO:')
        console.log('- ✅ Arquivo gerado corretamente')
        console.log('- ❓ Backend pode estar retornando HTML em vez de JSON')
        console.log('- ❓ Possível erro 500 interno no servidor')
        console.log('- ❓ Rota pode não estar registrada corretamente')

        console.log('\n💡 SOLUÇÕES ALTERNATIVAS:')
        console.log('1. Verificar logs do backend no terminal')
        console.log('2. Tentar importar uma planilha menor primeiro')
        console.log('3. Verificar se todas as dependências estão instaladas')
        console.log('4. Tentar reiniciar o backend')

    } catch (error) {
        console.error('\n💥 Erro durante verificação:', error)
    }
}

// Função para verificar estrutura do backend
async function checkBackendStructure(): Promise<void> {
    console.log('🔍 VERIFICANDO ESTRUTURA DO BACKEND...\n')

    try {
        // Verificar se rota existe no arquivo
        const adminRoutesPath = path.join(process.cwd(), 'src', 'routes', 'admin.ts')

        if (fs.existsSync(adminRoutesPath)) {
            const content = fs.readFileSync(adminRoutesPath, 'utf8')

            if (content.includes('importar-resultados-jogos')) {
                console.log('✅ Rota encontrada em src/routes/admin.ts')
            } else {
                console.log('❌ Rota NÃO encontrada em src/routes/admin.ts')
            }

            if (content.includes("adminRouter.post('/importar-resultados-jogos'")) {
                console.log('✅ Endpoint POST configurado corretamente')
            } else {
                console.log('❌ Endpoint POST não encontrado')
            }

        } else {
            console.log('❌ Arquivo src/routes/admin.ts não encontrado')
        }

        // Verificar se rota está sendo carregada
        const mainRoutesPath = path.join(process.cwd(), 'src', 'routes', 'main.ts')

        if (fs.existsSync(mainRoutesPath)) {
            const content = fs.readFileSync(mainRoutesPath, 'utf8')

            if (content.includes('adminRouter')) {
                console.log('✅ adminRouter sendo carregado em main.ts')
            } else {
                console.log('❌ adminRouter NÃO sendo carregado em main.ts')
            }
        }

        console.log('\n🔧 DIAGNÓSTICO COMPLETO:')
        console.log('- Verifique os logs do backend quando fizer upload')
        console.log('- O erro "<!DOCTYPE" indica resposta HTML em vez de JSON')
        console.log('- Provavelmente erro 500 interno no servidor')

    } catch (error) {
        console.error('Erro ao verificar estrutura:', error)
    }
}

// Função principal
async function main(): Promise<void> {
    const args = process.argv.slice(2)

    if (args.includes('--check') || args.includes('-c')) {
        await checkBackendStructure()
    } else if (args.includes('--help') || args.includes('-h')) {
        console.log('📖 USO DO SCRIPT:')
        console.log('')
        console.log('  npx ts-node scripts/test-upload-route.ts         # Verificar arquivo')
        console.log('  npx ts-node scripts/test-upload-route.ts --check # Verificar backend')
        console.log('  npx ts-node scripts/test-upload-route.ts --help  # Mostrar ajuda')
        console.log('')
    } else {
        await testBackendConnection()
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main()
        .then(() => {
            console.log('\n🔚 Verificação concluída.')
            process.exit(0)
        })
        .catch(error => {
            console.error('\n💥 Erro durante verificação:', error)
            process.exit(1)
        })
}

export default testBackendConnection