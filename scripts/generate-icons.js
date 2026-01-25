#!/usr/bin/env node

/**
 * Simple script to generate PWA icons from SVG
 * Run: node scripts/generate-icons.js
 * 
 * Note: This requires sharp to be installed: npm install --save-dev sharp
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconDir = path.join(__dirname, '../public/icons');
const svgPath = path.join(iconDir, 'icon.svg');

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.error('Error: sharp is not installed.');
      console.log('Please install it with: npm install --save-dev sharp');
      console.log('\nAlternatively, you can:');
      console.log('1. Use an online tool like https://realfavicongenerator.net/');
      console.log('2. Or manually create PNG icons in the sizes listed in manifest.json');
      process.exit(1);
    }

    // Read SVG
    const svgBuffer = fs.readFileSync(svgPath);
    
    // Generate each size
    for (const size of sizes) {
      const outputPath = path.join(iconDir, `icon-${size}x${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Generated ${outputPath}`);
    }
    
    // Also generate favicon
    const faviconPath = path.join(__dirname, '../public/favicon.ico');
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(path.join(__dirname, '../public/favicon-32x32.png'));
    await sharp(svgBuffer)
      .resize(16, 16)
      .png()
      .toFile(path.join(__dirname, '../public/favicon-16x16.png'));
    
    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
