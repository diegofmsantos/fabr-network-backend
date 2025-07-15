import express from 'express'
import { timeRouter } from './time'
import { jogadorRouter } from './jogador'
import { materiaRouter } from './materia'
import { adminRouter } from './admin'
import superligaRouter from './superliga'
import { rankingRouter } from './ranking'

export const mainRouter = express.Router()

mainRouter.use('/time', timeRouter)
mainRouter.use('/jogadores', jogadorRouter)
mainRouter.use('/materias', materiaRouter)
mainRouter.use('/admin', adminRouter)
mainRouter.use('/superliga', superligaRouter)
mainRouter.use('/ranking', rankingRouter)