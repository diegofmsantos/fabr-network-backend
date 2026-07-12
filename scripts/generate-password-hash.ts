import bcrypt from 'bcrypt'

const password = process.argv[2]

if (!password) {
  console.log('📖 USO DO SCRIPT:')
  console.log('')
  console.log('  npm run hash-password -- "minhaSenha"')
  console.log('')
  console.log('Gera o hash bcrypt para colar em ADMIN_PASSWORD_HASH no .env / Vercel.')
  process.exit(1)
}

bcrypt.hash(password, 10).then((hash) => {
  console.log('✅ Hash gerado com sucesso:')
  console.log('')
  console.log(hash)
  console.log('')
  console.log('Cole esse valor em ADMIN_PASSWORD_HASH no .env e nas variáveis de ambiente da Vercel.')
})
