import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import { mainRouter } from './routes/main'
import jwt from "jsonwebtoken"

const server = express()

server.use(helmet())
server.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}))
server.use(express.json({ limit: '50mb' }))
server.use(express.urlencoded({ extended: true, limit: '50mb' }))
server.use(express.static(path.join(__dirname, '../public')))

server.use('/api', mainRouter)

server.use((req, res, next) => {
    const authHeader = req.headers.authorization
  
    if (authHeader) {
      const token = authHeader.split(" ")[1]
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key") as { id: number; plano: string }
        req.user = decoded
      } catch (error) {
        res.status(401).json({ error: "Token inválido ou expirado" })
        return
      }
    } else { //@ts-ignore
      req.user = null
    }
    next()
  })
  
  

const port = process.env.PORT || 4000

server.listen(port, () => {
    console.log(`Servidor rodando no link: http://localhost:${port}`)
})
