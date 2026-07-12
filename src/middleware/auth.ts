import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Não autenticado' })
        return
    }

    const token = authHeader.slice('Bearer '.length)

    try {
        jwt.verify(token, process.env.JWT_SECRET as string)
        next()
    } catch (error) {
        res.status(401).json({ error: 'Sessão inválida ou expirada' })
    }
}

const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH']

export function protectWrites(req: Request, res: Response, next: NextFunction) {
    if (WRITE_METHODS.includes(req.method)) {
        requireAuth(req, res, next)
        return
    }

    next()
}
