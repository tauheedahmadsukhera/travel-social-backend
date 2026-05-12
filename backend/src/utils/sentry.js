const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

const initSentry = (app) => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
        nodeProfilingIntegration(),
      ],
      // Performance Monitoring
      // Performance Monitoring — sample 20% of transactions in production to reduce cost
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      // Set sampling rate for profiling - this is relative to tracesSampleRate
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    });

    // The request handler must be the first middleware on the app
    app.use(Sentry.Handlers.requestHandler());
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());
    
    console.log('✅ Sentry initialized for Backend');
  }
};

const setupSentryErrorHandler = (app) => {
  if (process.env.SENTRY_DSN) {
    // The error handler must be registered before any other error middleware and after all controllers
    app.use(Sentry.Handlers.errorHandler());
  }
};

module.exports = { initSentry, setupSentryErrorHandler };
