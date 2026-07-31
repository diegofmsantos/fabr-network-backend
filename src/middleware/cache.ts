import { Request, Response, NextFunction } from 'express'

/**
 * Adiciona Cache-Control só em respostas GET, deixando o CDN da Vercel servir
 * requisições repetidas sem invocar a Function de novo (reduz Fast Origin
 * Transfer). POST/PUT/DELETE nunca são cacheados, mesmo se esse middleware
 * for aplicado no router inteiro via `.use()`.
 */
export function cacheControlLeitura(maxAgeSegundos: number, staleWhileRevalidateSegundos = maxAgeSegundos * 5) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (req.method === 'GET') {
            res.set('Cache-Control', `public, s-maxage=${maxAgeSegundos}, stale-while-revalidate=${staleWhileRevalidateSegundos}`)
        }
        next()
    }
}
