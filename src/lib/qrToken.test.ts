/**
 * qrToken.test.ts
 * ---------------
 * The check-in pass is the one place in the app where a mistake is silent and
 * consequential: a token the encoder writes but the scanner cannot read means a
 * queue at the venue, and a parser that is too permissive means a code that
 * resolves to the wrong person.
 *
 * These tests cover both directions of that contract — encode, then decode the
 * real bitmap the `qrcode` encoder produces with `jsqr`, the same fallback
 * decoder the browser scanner uses.
 */

import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  buildQrPayload,
  extractQrToken,
  formatTokenForDisplay,
  isValidToken,
  QR_PAYLOAD_VERSION,
} from "./qrToken";

const TOKEN = "9f2a4c7e1b3d5f6081a2c3e4f5061728";
const OTHER_TOKEN = "00112233445566778899aabbccddeeff";

/**
 * Renders a payload with the real encoder, paints it into an RGBA buffer at
 * 4px per module (the quiet zone included), and runs it back through jsQR —
 * the same call the camera path makes on every frame.
 */
function roundTripThroughDecoder(payload: string): string | null {
  const matrix = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const scale = 4;
  const size = matrix.modules.size * scale;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let row = 0; row < matrix.modules.size; row++) {
    for (let col = 0; col < matrix.modules.size; col++) {
      if (!matrix.modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = col * scale + dx;
          const y = row * scale + dy;
          const i = (y * size + x) * 4;
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
        }
      }
    }
  }

  return jsQR(rgba, size, size, { inversionAttempts: "dontInvert" })?.data ?? null;
}

describe("buildQrPayload", () => {
  it("wraps a valid token in the versioned payload", () => {
    expect(buildQrPayload(TOKEN)).toBe(`${QR_PAYLOAD_VERSION}:${TOKEN}`);
  });

  it("normalises case and surrounding whitespace", () => {
    expect(buildQrPayload(`  ${TOKEN.toUpperCase()}  `)).toBe(
      `${QR_PAYLOAD_VERSION}:${TOKEN}`
    );
  });

  it("refuses anything that is not a 32-char hex token", () => {
    expect(buildQrPayload("")).toBeNull();
    expect(buildQrPayload("abc")).toBeNull();
    expect(buildQrPayload(TOKEN.slice(0, 31))).toBeNull();
    expect(buildQrPayload(`${TOKEN}f`)).toBeNull();
    expect(buildQrPayload(TOKEN.replace("9", "z"))).toBeNull();
  });
});

describe("extractQrToken", () => {
  it("reads back a canonical payload", () => {
    expect(extractQrToken(`${QR_PAYLOAD_VERSION}:${TOKEN}`)).toBe(TOKEN);
  });

  it("reads back a payload scanned with stray whitespace or casing", () => {
    expect(extractQrToken(`  ${QR_PAYLOAD_VERSION.toUpperCase()}:${TOKEN.toUpperCase()}\n`)).toBe(
      TOKEN
    );
  });

  it("reads back a bare token typed into the manual box", () => {
    expect(extractQrToken(TOKEN)).toBe(TOKEN);
    expect(extractQrToken(TOKEN.toUpperCase())).toBe(TOKEN);
  });

  it("reads back a deep link handed over by a camera app", () => {
    expect(extractQrToken(`https://techtrove.example/checkin/${TOKEN}`)).toBe(TOKEN);
    expect(extractQrToken(`https://techtrove.example/checkin?pass=${TOKEN}`)).toBe(TOKEN);
  });

  it("rejects codes it cannot vouch for", () => {
    expect(extractQrToken("")).toBeNull();
    expect(extractQrToken("   ")).toBeNull();
    expect(extractQrToken("TT-1234-ABCDEF")).toBeNull();
    // Right length, wrong alphabet — must not be salvaged.
    expect(extractQrToken("z".repeat(32))).toBeNull();
    // A prefix with no usable token behind it.
    expect(extractQrToken(`${QR_PAYLOAD_VERSION}:`)).toBeNull();
  });

  it("never returns more than the 32 hex characters of a token", () => {
    // An over-long run of hex is truncated to the first token, never passed
    // through whole, so it can never reach the RPC as something unexpected.
    const result = extractQrToken(`junk${TOKEN}morehexcharactershere`);
    expect(result).toBe(TOKEN);
  });
});

describe("encode/decode round trip", () => {
  it("jsQR reads the exact payload the pass renders", () => {
    const payload = buildQrPayload(TOKEN)!;
    const decoded = roundTripThroughDecoder(payload);
    expect(decoded).toBe(payload);
    expect(extractQrToken(decoded!)).toBe(TOKEN);
  });

  it("keeps two different participants on distinct, separable codes", () => {
    const a = buildQrPayload(TOKEN)!;
    const b = buildQrPayload(OTHER_TOKEN)!;
    expect(roundTripThroughDecoder(a)).toBe(a);
    expect(roundTripThroughDecoder(b)).toBe(b);
    expect(extractQrToken(a)).not.toBe(extractQrToken(b));
  });
});

describe("isValidToken", () => {
  it("accepts a well-formed token and rejects everything else", () => {
    expect(isValidToken(TOKEN)).toBe(true);
    expect(isValidToken(TOKEN.toUpperCase())).toBe(true);
    expect(isValidToken(`${QR_PAYLOAD_VERSION}:${TOKEN}`)).toBe(false);
    expect(isValidToken(TOKEN.slice(0, 31))).toBe(false);
  });
});

describe("formatTokenForDisplay", () => {
  it("groups the token so it can be read aloud", () => {
    expect(formatTokenForDisplay(TOKEN)).toBe("9F2A4C7E-1B3D5F60-81A2C3E4-F5061728");
  });

  it("passes through a value it does not recognise, still normalised", () => {
    expect(formatTokenForDisplay("nope")).toBe("NOPE");
  });
});
