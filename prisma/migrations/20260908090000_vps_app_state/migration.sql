-- PostgreSQL-backed replacement for Cloudflare KV and Durable Object storage.
CREATE TABLE "vps_app_state" (
    "key" VARCHAR(500) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vps_app_state_pkey" PRIMARY KEY ("key")
);
