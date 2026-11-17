import "dotenv/config";

// Integration tests share one database. Keep their pool small (the local `prisma dev`
// database allows only 10 connections in total).
process.env.DATABASE_POOL_MAX = "2";
