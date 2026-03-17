import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const sample = await prisma.professor.findMany({
  take: 10,
  select: { name: true, nameNormalized: true },
  orderBy: { rmpRatingsCount: "desc" },
});

console.log("Sample Professor rows:");
for (const p of sample) {
  console.log(`  name: ${JSON.stringify(p.name)}`);
  console.log(`  nameNormalized: ${JSON.stringify(p.nameNormalized)}`);
  console.log();
}

const nullCount = await prisma.professor.count({ where: { nameNormalized: null } });
const total = await prisma.professor.count();
console.log(`nameNormalized is NULL on ${nullCount}/${total} rows`);

await prisma.$disconnect();
await pool.end();