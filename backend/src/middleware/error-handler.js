module.exports = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
      },
    });
  }

  if (error.code === 'CORS_ORIGIN_DENIED') {
    return res.status(403).json({
      error: {
        code: error.code,
        message: 'This origin is not allowed.',
      },
    });
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  if (status >= 500) {
    console.error(`Unhandled API error: ${error.code || error.name || 'UNKNOWN_ERROR'}`);
  }

  return res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED',
      message: status === 500 ? 'Internal server error.' : 'Request could not be completed.',
    },
  });
};
