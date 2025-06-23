import express from 'express'
import { timeRouter } from './time'
import { jogadorRouter } from './jogador'
import { materiaRouter } from './materia'
import { adminRouter } from './admin'
import { campeonatoRouter } from './campeonato' 
import superligaRouter from './superliga'

export const mainRouter = express.Router()

mainRouter.use('/times', timeRouter)
mainRouter.use('/jogadores', jogadorRouter)
mainRouter.use('/materias', materiaRouter)
mainRouter.use('/admin', adminRouter)
mainRouter.use('/campeonatos', campeonatoRouter)
mainRouter.use('/api/campeonatos', superligaRouter)