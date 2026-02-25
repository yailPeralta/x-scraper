/**
 * Seed data for TrendingTopic collection.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/common/database/mongodb/seeds/trending-topics.seed.ts
 *
 * Or import `seedTrendingTopics` and call it from your bootstrap logic.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/** ── Seed documents ── */
export const trendingTopicsSeeds = [
  { tag: 'NEWS', nameEn: 'News', nameEs: 'Noticias' },
  { tag: 'CRYPTOCURRENCY', nameEn: 'Cryptocurrency', nameEs: 'Criptomoneda' },
  { tag: 'TECHNOLOGY', nameEn: 'Technology', nameEs: 'Tecnología' },
  {
    tag: 'BUSINESS_FINANCE',
    nameEn: 'Business & Finance',
    nameEs: 'Negocios y finanzas',
  },
  { tag: 'MEMES', nameEn: 'Memes', nameEs: 'Memes' },
  { tag: 'FOOD', nameEn: 'Food', nameEs: 'Comida' },
  { tag: 'SPORTS', nameEn: 'Sports', nameEs: 'Deportes' },
  { tag: 'CELEBRITY', nameEn: 'Celebrity', nameEs: 'Celebridades' },
  { tag: 'DANCE', nameEn: 'Dance', nameEs: 'Baile' },
  { tag: 'MOVIES_TV', nameEn: 'Movies & TV', nameEs: 'Cine y TV' },
  { tag: 'FASHION', nameEn: 'Fashion', nameEs: 'Moda' },
  { tag: 'PETS', nameEn: 'Pets', nameEs: 'Mascotas' },
  { tag: 'RELATIONSHIPS', nameEn: 'Relationships', nameEs: 'Relaciones' },
  { tag: 'SCIENCE', nameEn: 'Science', nameEs: 'Ciencia' },
  { tag: 'MUSIC', nameEn: 'Music', nameEs: 'Música' },
  { tag: 'GAMING', nameEn: 'Gaming', nameEs: 'Videojuegos' },
  { tag: 'CARS', nameEn: 'Cars', nameEs: 'Coches' },
  {
    tag: 'NATURE_OUTDOORS',
    nameEn: 'Nature & Outdoors',
    nameEs: 'Naturaleza y aire libre',
  },
  {
    tag: 'HOME_GARDEN',
    nameEn: 'Home & Garden',
    nameEs: 'Hogar y jardinería',
  },
  { tag: 'TRAVEL', nameEn: 'Travel', nameEs: 'Viajes' },
  {
    tag: 'HEALTH_FITNESS',
    nameEn: 'Health & Fitness',
    nameEs: 'Salud y bienestar',
  },
  { tag: 'BEAUTY', nameEn: 'Beauty', nameEs: 'Belleza' },
  { tag: 'ANIME', nameEn: 'Anime', nameEs: 'Anime' },
  { tag: 'RELIGION', nameEn: 'Religion', nameEs: 'Religión' },
];

/** ── Mongoose schema (standalone, no NestJS deps) ── */
const trendingTopicSchema = new mongoose.Schema(
  {
    tag: { type: String, required: true, unique: true, index: true },
    nameEn: { type: String, required: true },
    nameEs: { type: String, required: true },
  },
  { timestamps: true },
);

const TrendingTopicModel =
  mongoose.models.TrendingTopic ||
  mongoose.model('TrendingTopic', trendingTopicSchema, 'trendingtopics');

/**
 * Seed trending topics into MongoDB.
 * Skips documents that already exist (matched by tag).
 */
export async function seedTrendingTopics(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of trendingTopicsSeeds) {
    const exists = await TrendingTopicModel.findOne({ tag: seed.tag });

    if (exists) {
      skipped++;
      console.log(`  ⏭  Skipped (already exists): "${seed.tag}"`);
    } else {
      await TrendingTopicModel.create(seed);
      inserted++;
      console.log(`  ✅ Inserted: "${seed.tag}" (${seed.nameEn} / ${seed.nameEs})`);
    }
  }

  console.log(
    `\nSeed complete: ${inserted} inserted, ${skipped} skipped (${trendingTopicsSeeds.length} total)`,
  );
}

/** ── Standalone execution ── */
async function main(): Promise<void> {
  const username = process.env.MONGODB_USERNAME || 'admin';
  const password = process.env.MONGODB_PASSWORD || 'password';
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const dbName = process.env.MONGODB_DB_NAME || 'twitter-scraper';

  const uri = `mongodb://${username}:${password}@${host}:${port}/${dbName}?authSource=admin`;

  console.log(`Connecting to MongoDB at ${host}:${port}/${dbName}...`);
  await mongoose.connect(uri);
  console.log('Connected.\n');

  console.log('Seeding TrendingTopic collection...\n');
  await seedTrendingTopics();

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

// Run if executed directly
main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
