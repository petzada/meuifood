import { seedModelMerchant } from "../src/seed.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL é obrigatória para executar o seed.");
}

await seedModelMerchant(databaseUrl);
