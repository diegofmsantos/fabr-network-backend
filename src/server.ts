import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import { mainRouter } from './routes/main'

const server = express()


const allowedOrigins = [
    'http://localhost:3000',              // Frontend Admin (dev)
    'http://localhost:3001',              // Frontend Exibição (dev) 
    'https://fabr-network-admin.vercel.app', // Frontend Admin (prod)
    'https://fabrnetwork.com.br',         // Frontend Exibição (prod)
    'https://fabr-back.vercel.app',
]
server.use(helmet())
server.use(cors({
    origin: function (origin, callback) {

        if (!origin) return callback(null, true)

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))

server.use(express.json({ limit: '50mb' }))
server.use(express.urlencoded({ extended: true, limit: '50mb' }))
server.use(express.static(path.join(__dirname, '../public')))
server.use('/api', mainRouter)

const port = process.env.PORT || 5000

server.listen(port, () => {
    console.log(`🚀 Servidor rodando em: http://localhost:${port}`)
    console.log(`📊 API disponível em: http://localhost:${port}/api`)
})
