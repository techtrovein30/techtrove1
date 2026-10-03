const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { chromium } = require("playwright");

// Output directories
const dirWithQuotes = path.join(__dirname, "..", "public", "checkin qr's");
const dirClean = path.join(__dirname, "..", "public", "checkin-qrs");

for (const dir of [dirWithQuotes, dirClean]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Event Definitions
const events = [
  // 1. Unified Sports Pass (Day 1 - Master Pass for All Sports)
  {
    fileName: "sports-pass.png",
    alias: "all-sports.png",
    id: "sports-unified-master",
    title: "TECHTROVE 3.0 · SPORTS PASS",
    subtitle: "SCAN WITH PHONE CAMERA",
    token: "sports_unified_checkin_token_day1",
  },

  // 2. Day 2 - Technical Events
  {
    fileName: "hackathon.png",
    id: "hackathon",
    title: "TECHTROVE 3.0 · HACKATHON",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "debugging.png",
    id: "debugging",
    title: "TECHTROVE 3.0 · DEBUGGING",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "paper-presentation.png",
    id: "paper-presentation",
    title: "TECHTROVE 3.0 · PAPER PRESENTATION",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "tech-maze.png",
    id: "tech-maze",
    title: "TECHTROVE 3.0 · TECH MAZE",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "quiz.png",
    id: "quiz",
    title: "TECHTROVE 3.0 · TECH QUIZ",
    subtitle: "SCAN WITH PHONE CAMERA",
  },

  // 3. Day 2 - Non-Technical Events
  {
    fileName: "dance.png",
    id: "dance",
    title: "TECHTROVE 3.0 · SOLO/GROUP DANCE",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "singing.png",
    id: "singing",
    title: "TECHTROVE 3.0 · SINGING",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "gaming.png",
    id: "gaming",
    title: "TECHTROVE 3.0 · MOBILE GAMING",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "ramp-walk.png",
    id: "ramp-walk",
    title: "TECHTROVE 3.0 · RAMP WALK",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "treasure-hunt.png",
    id: "treasure-hunt",
    title: "TECHTROVE 3.0 · TREASURE HUNT",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "connexion.png",
    id: "connexion",
    title: "TECHTROVE 3.0 · CONNEXION",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "adaptune.png",
    id: "adaptune",
    title: "TECHTROVE 3.0 · ADAPTUNE",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "tunetopia.png",
    id: "tunetopia",
    title: "TECHTROVE 3.0 · TUNETOPIA",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "logo-making.png",
    id: "logo-making",
    title: "TECHTROVE 3.0 · LOGO MAKING",
    subtitle: "SCAN WITH PHONE CAMERA",
  },

  // 4. Individual Sports Event QRs (Convenience for specific field desks)
  {
    fileName: "cricket.png",
    id: "cricket",
    title: "TECHTROVE 3.0 · CRICKET",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "football.png",
    id: "football",
    title: "TECHTROVE 3.0 · FOOTBALL",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "volleyball.png",
    id: "volleyball",
    title: "TECHTROVE 3.0 · VOLLEYBALL",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "kabaddi.png",
    id: "kabaddi",
    title: "TECHTROVE 3.0 · KABADDI",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "kho-kho.png",
    id: "sport-khokho-girls",
    title: "TECHTROVE 3.0 · KHO-KHO (GIRLS)",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "throwball.png",
    id: "sport-throwball-girls",
    title: "TECHTROVE 3.0 · THROWBALL (GIRLS)",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "chess.png",
    id: "sport-chess-girls",
    title: "TECHTROVE 3.0 · CHESS",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
  {
    fileName: "carrom.png",
    id: "sport-carrom-girls",
    title: "TECHTROVE 3.0 · CARROM",
    subtitle: "SCAN WITH PHONE CAMERA",
  },
];

async function generateAll() {
  console.log(`Generating ${events.length} QR code cards...`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2, // Ultra-crisp 2x resolution
  });
  const page = await context.newPage();

  for (const item of events) {
    const rawToken =
      item.token ||
      crypto.createHash("sha256").update(`techtrove_attendance_${item.id}`).digest("hex").slice(0, 32);

    const payload = `TTE1:${rawToken}`;
    const targetUrl = `https://techtrove.live/attendance?token=${encodeURIComponent(payload)}`;

    // Generate high resolution SVG/DataURL of the QR code
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 440,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });

    // Render HTML card matching the user's reference image
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          }
          .qr-card {
            width: 480px;
            background: #ffffff;
            border-radius: 36px;
            padding: 36px 36px 32px 36px;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
          }
          .qr-image {
            width: 380px;
            height: 380px;
            object-fit: contain;
            display: block;
          }
          .title {
            margin-top: 24px;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 0.08em;
            color: #0f172a;
            text-align: center;
            text-transform: uppercase;
          }
          .subtitle {
            margin-top: 6px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.12em;
            color: #64748b;
            text-align: center;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="qr-card" id="card">
          <img class="qr-image" src="${qrDataUrl}" alt="${item.title}" />
          <div class="title">${item.title}</div>
          <div class="subtitle">${item.subtitle}</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html);
    const cardHandle = await page.$("#card");

    const outPath1 = path.join(dirWithQuotes, item.fileName);
    const outPath2 = path.join(dirClean, item.fileName);

    await cardHandle.screenshot({
      path: outPath1,
      omitBackground: true,
    });
    fs.copyFileSync(outPath1, outPath2);

    if (item.alias) {
      const aliasPath1 = path.join(dirWithQuotes, item.alias);
      const aliasPath2 = path.join(dirClean, item.alias);
      fs.copyFileSync(outPath1, aliasPath1);
      fs.copyFileSync(outPath1, aliasPath2);
    }

    console.log(`  ✓ Created: ${item.fileName} (${item.title})`);
  }

  await browser.close();
  console.log("\nAll QR code cards successfully generated!");
  console.log(`Location: public/checkin qr's/ and public/checkin-qrs/`);
}

generateAll().catch((err) => {
  console.error("Failed to generate QR cards:", err);
  process.exit(1);
});
