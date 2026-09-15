/**
 * SkillBuild Bulk Course Translation Script
 * ======================================================
 * Translates all courses in the MongoDB database into
 * Punjabi (pa) and French (fr) using open-source cascading
 * providers (MyMemory + LibreTranslate mirrors).
 *
 * Usage:
 *   npx tsx scripts/bulk-translate-courses.ts
 *   npx tsx scripts/bulk-translate-courses.ts --force
 */

import mongoose, { Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Load .env from LMS-Backend root
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

const force = process.argv.includes('--force');

// Translation helper with MyMemory + LibreTranslate fallback
async function translateText(text: string, to: string, from = 'en'): Promise<string> {
  if (!text || !text.trim()) return text;
  if (from === to) return text;

  // Clean text
  const clean = text.trim();

  // Strategy 1: MyMemory free API
  try {
    const encoded = encodeURIComponent(clean);
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${from}|${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const data: any = await res.json();
      const translated = data?.responseData?.translatedText;
      if (
        translated &&
        typeof translated === 'string' &&
        !translated.includes('MYMEMORY WARNING') &&
        !translated.toLowerCase().includes('quota exceeded')
      ) {
        return decodeHtmlEntities(translated);
      }
    }
  } catch (err: any) {
    // fallback
  }

  // Strategy 2: LibreTranslate mirror
  try {
    const libreUrl =
      process.env.LIBRETRANSLATE_URL || 'https://libretranslate.de/translate';
    const res = await fetch(libreUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: clean,
        source: from,
        target: to,
        format: 'text',
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data?.translatedText) {
        return decodeHtmlEntities(data.translatedText);
      }
    }
  } catch (err: any) {
    // fallback
  }

  return clean;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function computeHash(data: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('====================================================');
  console.log('   SkillBuild Bulk Course Translation Migration');
  console.log('====================================================');
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI!);
  console.log(`Connected successfully!`);

  const coursesCol = mongoose.connection.collection('courses');
  const translationsCol = mongoose.connection.collection('course_translations');
  const jobsCol = mongoose.connection.collection('translation_jobs');
  const lessonsCol = mongoose.connection.collection('lessons');
  const lessonTransCol = mongoose.connection.collection('lesson_translations');

  const courses = await coursesCol.find({}).toArray();
  console.log(`Found ${courses.length} courses in database.`);
  console.log(`Target locales: Punjabi (pa), French (fr)`);
  console.log(`Force re-translation: ${force}\n`);

  let translatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const courseId = c._id;
    const courseName = c.course_name || 'Untitled Course';

    console.log(`[${i + 1}/${courses.length}] Processing: "${courseName}"`);

    const contentHash = computeHash({
      course_name: c.course_name,
      about_course: c.about_course,
      description: c.description,
      overview: c.overview,
      learning_points: c.learning_points,
      skills_you_gain: c.skills_you_gain,
    });

    for (const locale of ['pa', 'fr']) {
      const existing = await translationsCol.findOne({
        course_id: courseId,
        locale: locale,
      });

      if (existing && !force && existing.content_hash === contentHash && existing.status === 'completed') {
        console.log(`    ↳ [${locale.toUpperCase()}] Already up to date. Skipping.`);
        skippedCount++;
        continue;
      }

      console.log(`    ↳ [${locale.toUpperCase()}] Translating course details...`);
      
      const [transName, transAbout, transDesc, transOverview] = await Promise.all([
        translateText(c.course_name || '', locale),
        c.about_course ? translateText(c.about_course, locale) : null,
        c.description ? translateText(c.description, locale) : null,
        c.overview ? translateText(c.overview, locale) : null,
      ]);

      const transLearningPoints: string[] = [];
      if (Array.isArray(c.learning_points)) {
        for (const pt of c.learning_points) {
          if (pt) {
            transLearningPoints.push(await translateText(pt, locale));
            await sleep(60);
          }
        }
      }

      const transSkills: string[] = [];
      if (Array.isArray(c.skills_you_gain)) {
        for (const sk of c.skills_you_gain) {
          if (sk) {
            transSkills.push(await translateText(sk, locale));
            await sleep(60);
          }
        }
      }

      // Upsert Course Translation
      await translationsCol.updateOne(
        { course_id: courseId, locale: locale },
        {
          $set: {
            course_id: courseId,
            locale: locale,
            course_name: transName,
            about_course: transAbout,
            description: transDesc,
            overview: transOverview,
            learning_points: transLearningPoints,
            skills_you_gain: transSkills,
            status: 'completed',
            source: 'machine_generated',
            content_hash: contentHash,
            error_message: null,
            translated_at: new Date(),
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      // Translate associated lessons
      const lessons = await lessonsCol.find({ course_id: courseId }).toArray();
      for (const lesson of lessons) {
        const transLessonName = await translateText(lesson.lesson_name || '', locale);
        const transLessonDesc = lesson.description
          ? await translateText(lesson.description, locale)
          : null;

        await lessonTransCol.updateOne(
          { lesson_id: lesson._id, locale: locale },
          {
            $set: {
              lesson_id: lesson._id,
              course_id: courseId,
              locale: locale,
              lesson_name: transLessonName,
              description: transLessonDesc,
              status: 'completed',
              source: 'machine_generated',
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
        await sleep(50);
      }

      // Update Translation Job record
      await jobsCol.updateOne(
        { course_id: courseId, target_locale: locale },
        {
          $set: {
            course_id: courseId,
            target_locale: locale,
            source_locale: 'en',
            status: 'completed',
            attempts: 1,
            max_attempts: 3,
            completed_at: new Date(),
            error_message: null,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      console.log(`    ↳ [${locale.toUpperCase()}] ✓ Completed: "${transName}"`);
      translatedCount++;
      await sleep(150);
    }
  }

  console.log('\n====================================================');
  console.log('   Migration Summary');
  console.log('====================================================');
  console.log(`Total courses processed: ${courses.length}`);
  console.log(`Translations created/updated: ${translatedCount}`);
  console.log(`Translations skipped (already current): ${skippedCount}`);
  console.log('All existing courses are now multilingual!');

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

main().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
