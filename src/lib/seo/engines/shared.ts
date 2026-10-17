/**
 * Lo común a los tres motores: la misma instrucción de sistema, para que la
 * sonda se parezca a lo que recibe un viajero argentino que pregunta en
 * castellano, y los tiempos de espera.
 */
export const GEO_SYSTEM_PROMPT =
  'Sos un asistente que responde a viajeros de Argentina. Respondé en castellano rioplatense, de forma concreta y útil, ' +
  'nombrando agencias, sitios o empresas específicas cuando corresponda y citando las fuentes que uses. No pidas aclaraciones: respondé con la mejor información disponible.'

export const ENGINE_TIMEOUT_MS = 120_000
