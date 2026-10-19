import type { FastifyRequest } from 'fastify';

/** Authenticated wallet work can require several bounded provider and RPC reads. */
export function setAuthenticatedResponseTimeout(request: FastifyRequest): void {
  request.raw.socket?.setTimeout?.(60000);
}
