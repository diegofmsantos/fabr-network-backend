import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import { mainRouter } from './routes/main'

const server = express()

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://fabr-network-admin.vercel.app',
    'https://fabrnetwork.com.br',
    'https://www.fabrnetwork.com.br',
    'https://fabr-network-backend.vercel.app',
]

// Log para debug
console.log('🌐 Origens permitidas:', allowedOrigins)

server.use(helmet())

// CORS configuração corrigida
server.use(cors({
    origin: function (origin, callback) {
        console.log('📍 Requisição de origem:', origin)
        
        // Permite requisições sem origin (mobile apps, Postman, etc.)
        if (!origin) {
            console.log('✅ Permitindo requisição sem origin')
            return callback(null, true)
        }

        // Verifica se a origem está na lista permitida
        if (allowedOrigins.indexOf(origin) !== -1) {
            console.log('✅ Origem permitida:', origin)
            callback(null, true)
        } else {
            console.log('❌ Origem NÃO permitida:', origin)
            // Em produção, podemos ser mais permissivos temporariamente
            if (process.env.NODE_ENV === 'production') {
                console.log('⚠️ Permitindo em produção para debug')
                callback(null, true)
            } else {
                callback(new Error(`Origin ${origin} not allowed by CORS`))
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))

// Middleware adicional para headers CORS
server.use((req, res, next) => {
    const origin = req.headers.origin
    console.log('🔄 Middleware CORS - Origin:', origin)
    
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin)
    } else {
        // Temporariamente permite qualquer origin em produção
        if (process.env.NODE_ENV === 'production') {
            res.header('Access-Control-Allow-Origin', '*')
        }
    }
    
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    
    // Responde preflight requests
    if (req.method === 'OPTIONS') {
        console.log('🚀 Respondendo OPTIONS request')
        res.sendStatus(200)
    } else {
        next()
    }
})

server.use(express.json({ limit: '50mb' }))
server.use(express.urlencoded({ extended: true, limit: '50mb' }))
server.use(express.static(path.join(__dirname, '../public')))

// Middleware de log para debug
server.use('/api', (req, res, next) => {
    console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin}`)
    next()
})

server.use('/api', mainRouter)

// Rota de teste
server.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        cors: 'enabled',
        allowedOrigins 
    })
})

const port = process.env.PORT || 5000

server.listen(port, () => {
    console.log(`🚀 Servidor rodando em: http://localhost:${port}`)
    console.log(`📊 API disponível em: http://localhost:${port}/api`)
    console.log(`🏥 Health check: http://localhost:${port}/health`)
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
})