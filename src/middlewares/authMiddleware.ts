import { Request, Response, NextFunction } from "express";

export const verificarPlano = (planoNecessario: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return; // Saia após responder
    }

    const { plano } = req.user;

    if (plano !== planoNecessario && plano !== 'PREMIUM') {
      res.status(403).json({ error: 'Acesso negado: plano insuficiente' });
      return; // Saia após responder
    }

    next(); // Continua se o plano for válido
  };
};
