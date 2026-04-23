
import sharp from 'sharp';
import fs from 'fs';

async function createRobotSprite(filename, color, isTall) {
  const frameSize = 32;
  const numFrames = 92;
  const width = frameSize * numFrames;
  const height = frameSize;

  // Create a base frame (32x32)
  const robotFrame = Buffer.alloc(frameSize * frameSize * 4, 0); // Transparent

  // Draw a simple robot
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const drawRect = (x, y, w, h, fillR, fillG, fillB) => {
    for (let iy = y; iy < y + h; iy++) {
      for (let ix = x; ix < x + w; ix++) {
        const idx = (iy * frameSize + ix) * 4;
        if (idx >= 0 && idx < robotFrame.length) {
          robotFrame[idx] = fillR;
          robotFrame[idx + 1] = fillG;
          robotFrame[idx + 2] = fillB;
          robotFrame[idx + 3] = 255;
        }
      }
    }
  };

  if (isTall) {
    // CRAFT: Tall body
    drawRect(11, 8, 10, 16, r, g, b); // Body
    drawRect(12, 11, 2, 2, 0, 0, 0);  // Eye L
    drawRect(18, 11, 2, 2, 0, 0, 0);  // Eye R
    drawRect(12, 24, 2, 6, r, g, b);  // Leg L
    drawRect(18, 24, 2, 6, r, g, b);  // Leg R
  } else {
    // CODE: Wide body
    drawRect(8, 12, 16, 12, r, g, b); // Body
    drawRect(10, 15, 2, 2, 0, 0, 0);  // Eye L
    drawRect(20, 15, 2, 2, 0, 0, 0);  // Eye R
    drawRect(10, 24, 2, 4, r, g, b);  // Leg L
    drawRect(20, 24, 2, 4, r, g, b);  // Leg R
  }

  // Multiply frame to 92 frames
  const fullSheet = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < numFrames; i++) {
    for (let y = 0; y < height; y++) {
      robotFrame.copy(fullSheet, (y * width + i * frameSize) * 4, y * frameSize * 4, (y + 1) * frameSize * 4);
    }
  }

  await sharp(fullSheet, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filename);

  console.log(`Created ${filename}`);
}

async function fixAll() {
  if (!fs.existsSync('public/sprites')) fs.mkdirSync('public/sprites', { recursive: true });
  
  await createRobotSprite('public/sprites/craft.png', '#EC4899', true);
  await createRobotSprite('public/sprites/code.png', '#10B981', false);
  
  // Also create a basic logo.png if it was broken
  const logoSize = 128;
  const logo = Buffer.alloc(logoSize * logoSize * 4, 255); // White square
  await sharp(logo, { raw: { width: logoSize, height: logoSize, channels: 4 } })
    .png()
    .toFile('public/images/logo.png');
    
  console.log('All sprites fixed!');
}

fixAll().catch(console.error);
