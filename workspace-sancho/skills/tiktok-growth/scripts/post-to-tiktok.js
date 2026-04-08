#!/usr/bin/env node
/**
 * Post a 6-slide TikTok slideshow via Metricool API.
 * 
 * Usage: node post-to-tiktok.js --config <config.json> --dir <slides-dir> --caption "caption text" --title "post title"
 * 
 * IMPORTANT: Metricool requires images to be accessible via public URL.
 * The images must be uploaded to a public server BEFORE calling this script.
 * 
 * Expected: slide1.png through slide6.png already uploaded to a CDN/server.
 * Config must contain imageBaseUrl (e.g. "https://cdn.example.com/larry/posts/20260317/")
 * 
 * Posts to TikTok via Metricool schedule-post.js.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

const configPath = getArg('config');
const dir = getArg('dir');
const caption = getArg('caption');
const title = getArg('title') || '';

if (!configPath || !dir || !caption) {
  console.error('Usage: node post-to-tiktok.js --config <config.json> --dir <dir> --caption "text" [--title "text"]');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Validate Metricool config
if (!config.metricool?.userToken || !config.metricool?.userId || !config.metricool?.blogId) {
  console.error('❌ Missing Metricool config. Required: config.metricool.userToken, userId, blogId');
  process.exit(1);
}

// Validate image URLs
if (!config.metricool?.imageBaseUrl) {
  console.error('❌ Missing config.metricool.imageBaseUrl. Images must be publicly accessible.');
  console.error('   Example: "https://cdn.example.com/larry/posts/20260317/"');
  console.error('\n⚠️  METRICOOL LIMITATION: Images must be uploaded to a public CDN before posting.');
  console.error('   This script assumes slide1.png-slide6.png are already uploaded to imageBaseUrl.');
  process.exit(1);
}

(async () => {
  console.log('📤 Preparing TikTok post via Metricool...');
  
  // Build image URLs
  const imageBaseUrl = config.metricool.imageBaseUrl.replace(/\/$/, '');
  const imageUrls = [];
  for (let i = 1; i <= 6; i++) {
    const localPath = path.join(dir, `slide${i}.png`);
    if (!fs.existsSync(localPath)) {
      console.error(`  ❌ Missing: ${localPath}`);
      process.exit(1);
    }
    imageUrls.push(`${imageBaseUrl}/slide${i}.png`);
    console.log(`  ✅ Slide ${i}: ${imageUrls[i - 1]}`);
  }

  // Schedule post via Metricool
  const metricoolScript = path.join(__dirname, '../../metricool/scripts/schedule-post.js');
  
  // Metricool posting format
  const postData = {
    platforms: ['tiktok'],
    text: caption,
    datetime: new Date().toISOString(), // Post now
    timezone: config.metricool.timezone || 'Europe/Madrid',
    imageUrl: imageUrls[0], // First image (Metricool may only support 1 image for TikTok)
    blogId: config.metricool.blogId
  };

  console.log('\n📱 Scheduling TikTok post via Metricool...');
  console.log(`  Platform: TikTok`);
  console.log(`  Caption: "${caption.substring(0, 60)}..."`);
  console.log(`  Images: ${imageUrls.length} (may need manual post creation if Metricool doesn't support multi-image)`);

  // Call Metricool schedule-post
  const proc = spawn('node', [metricoolScript, JSON.stringify(postData)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      METRICOOL_USER_TOKEN: config.metricool.userToken,
      METRICOOL_USER_ID: config.metricool.userId
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ Metricool post failed with code ${code}`);
      process.exit(1);
    }

    console.log('✅ Posted to TikTok via Metricool!');

    // Save metadata
    const metaPath = path.join(dir, 'meta.json');
    const meta = {
      caption,
      title,
      postedAt: new Date().toISOString(),
      images: imageUrls,
      platform: 'tiktok',
      service: 'metricool'
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`📋 Metadata saved to ${metaPath}`);
  });
})();
