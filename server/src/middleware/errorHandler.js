/**
 * Centralized Express error middleware.
 * Never leak internal details in production.
 */
export function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  console.error('[error]', {
    path: req.path,
    method: req.method,
    status,
    message: err.message,
    ...(isDev && { stack: err.stack }),
  });

  res.status(status).json({
    error: {
      message: status >= 500 && !isDev ? 'Internal server error' : err.message,
      code: err.code || 'INTERNAL_ERROR',
      ...(isDev && status >= 500 ? { stack: err.stack } : {}),
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
    },
  });
}
