import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";

export async function writeQrPng(urlForWeb) {
  if (typeof urlForWeb !== "string" || !urlForWeb.startsWith("https://")) {
    throw new Error("Invalid sign-in URL");
  }
  const dir = await mkdtemp(join(tmpdir(), "baw-tg-qr-"));
  const filePath = join(dir, "signin.png");
  const buffer = await QRCode.toBuffer(urlForWeb, {
    type: "png",
    width: 480,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  await writeFile(filePath, buffer);
  return {
    filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
