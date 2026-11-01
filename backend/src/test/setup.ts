/**
 * Per-worker test environment.
 *
 * These assignments run before any test file imports `../src/app.js`, which is
 * important because the Prisma client captures DATABASE_URL when it is created
 * and the config module deliberately skips .env loading when NODE_ENV=test.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.DEMO_MODE = "true";
process.env.DEMO_USERS_ENABLED = "true";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
process.env.AI_PROVIDER = "demo";
process.env.AI_ESCALATION_THRESHOLD = "0.75";
process.env.PAYPAL_ENV = "sandbox";
process.env.PAYPAL_CURRENCY = "USD";
process.env.PAYPAL_PAYOUTS_ENABLED = "false";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.API_BASE_URL = "http://localhost:4000";
process.env.REWARD_MIN_MINOR = "500";
process.env.REWARD_MAX_MINOR = "10000";
process.env.GEMINI_API_KEY = "";
process.env.ELASTIC_ENABLED = "false";
process.env.ELASTICSEARCH_URL = "";
process.env.ELASTICSEARCH_API_KEY = "";
process.env.ELASTIC_INDEX_SPECIALISTS = "trusttopay-specialists-test";
process.env.JINA_API_KEY = "";
process.env.JINA_EMBEDDING_MODEL = "jina-embeddings-v3";

