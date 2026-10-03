const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { chromium } = require("playwright");

// The single output directory requested: "public/checkin qr's"
const outputDir = path.join(__dirname, "..", "public", "checkin qr's");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// User's verified production domain
const BASE_DOMAIN = process.env.SITE_URL || "https://techtrove3-simats.vercel.app";

// Event Definitions
const events = [
  // 1. Unified Sports Pass (Day 1 - Master Pass for All Sports)
  {
    fileName: "sports-pass.png",
    alias: "all-sports.png",
    id: "sports-unified-master",
    title: "TECHTROVE 3.0 · SPORTS PASS",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_sports_unified_day1",
  },

  // 2. Day 2 - Technical Events
  {
    fileName: "hackathon.png",
    id: "hackathon",
    title: "TECHTROVE 3.0 · HACKATHON",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_hackathon",
  },
  {
    fileName: "debugging.png",
    id: "debugging",
    title: "TECHTROVE 3.0 · DEBUGGING",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_debugging",
  },
  {
    fileName: "paper-presentation.png",
    id: "paper-presentation",
    title: "TECHTROVE 3.0 · PAPER PRESENTATION",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_paper_presentation",
  },
  {
    fileName: "tech-maze.png",
    id: "tech-maze",
    title: "TECHTROVE 3.0 · TECH MAZE",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_tech_maze",
  },
  {
    fileName: "quiz.png",
    id: "quiz",
    title: "TECHTROVE 3.0 · TECH QUIZ",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_quiz",
  },

  // 3. Day 2 - Non-Technical Events
  {
    fileName: "dance.png",
    id: "dance",
    title: "TECHTROVE 3.0 · SOLO/GROUP DANCE",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_dance",
  },
  {
    fileName: "singing.png",
    id: "singing",
    title: "TECHTROVE 3.0 · SINGING",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_singing",
  },
  {
    fileName: "gaming.png",
    id: "gaming",
    title: "TECHTROVE 3.0 · MOBILE GAMING",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_gaming",
  },
  {
    fileName: "ramp-walk.png",
    id: "ramp-walk",
    title: "TECHTROVE 3.0 · RAMP WALK",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_ramp_walk",
  },
  {
    fileName: "treasure-hunt.png",
    id: "treasure-hunt",
    title: "TECHTROVE 3.0 · TREASURE HUNT",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_treasure_hunt",
  },
  {
    fileName: "connexion.png",
    id: "connexion",
    title: "TECHTROVE 3.0 · CONNEXION",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_connexion",
  },
  {
    fileName: "adaptune.png",
    id: "adaptune",
    title: "TECHTROVE 3.0 · ADAPTUNE",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_adaptune",
  },
  {
    fileName: "tunetopia.png",
    id: "tunetopia",
    title: "TECHTROVE 3.0 · TUNETOPIA",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_tunetopia",
  },
  {
    fileName: "logo-making.png",
    id: "logo-making",
    title: "TECHTROVE 3.0 · LOGO MAKING",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_logo_making",
  },

  // 4. Individual Sports Event QRs (For field-specific desk signs)
  {
    fileName: "cricket.png",
    id: "cricket",
    title: "TECHTROVE 3.0 · CRICKET",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_cricket",
  },
  {
    fileName: "football.png",
    id: "football",
    title: "TECHTROVE 3.0 · FOOTBALL",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_football",
  },
  {
    fileName: "volleyball.png",
    id: "volleyball",
    title: "TECHTROVE 3.0 · VOLLEYBALL",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_volleyball",
  },
  {
    fileName: "kabaddi.png",
    id: "kabaddi",
    title: "TECHTROVE 3.0 · KABADDI",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_kabaddi",
  },
  {
    fileName: "kho-kho.png",
    id: "sport-khokho-girls",
    title: "TECHTROVE 3.0 · KHO-KHO (GIRLS)",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_khokho",
  },
  {
    fileName: "throwball.png",
    id: "sport-throwball-girls",
    title: "TECHTROVE 3.0 · THROWBALL (GIRLS)",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_throwball",
  },
  {
    fileName: "chess.png",
    id: "sport-chess-girls",
    title: "TECHTROVE 3.0 · CHESS",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_chess",
  },
  {
    fileName: "carrom.png",
    id: "sport-carrom-girls",
    title: "TECHTROVE 3.0 · CARROM",
    subtitle: "SCAN WITH PHONE CAMERA",
    seed: "techtrove_event_carrom",
  },
];

async function generateAll() {
  console.log(`Using base domain: ${BASE_DOMAIN}`);
  console.log(`Generating ${events.length} QR code cards to: public/checkin qr's/`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const item of events) {
    // Generate valid 32-hex character lowercase token
    const rawToken = crypto
      .createHash("sha256")
      .update(item.seed || item.id)
      .digest("hex")
      .slice(0, 32);

    const payload = `TTE1:${rawToken}`;
    const targetUrl = `${BASE_DOMAIN}/attendance?token=${encodeURIComponent(payload)}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 440,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });

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

    const outPath = path.join(outputDir, item.fileName);
    await cardHandle.screenshot({
      path: outPath,
      omitBackground: true,
    });

    if (item.alias) {
      const aliasPath = path.join(outputDir, item.alias);
      fs.copyFileSync(outPath, aliasPath);
    }

    console.log(`  ✓ ${item.fileName} -> ${targetUrl}`);
  }

  await browser.close();
  console.log("\nAll QR code cards successfully generated in public/checkin qr's!");
}

generateAll().catch((err) => {
  console.error("Failed to generate QR cards:", err);
  process.exit(1);
});
