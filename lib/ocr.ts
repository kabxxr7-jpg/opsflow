import { createWorker } from "tesseract.js";

export class OCRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OCRError";
  }
}

const OCR_TIMEOUT_MS = 45_000;

export interface OCRResult {
  text: string;
  confidence: number; // normalized 0-1, Tesseract reports 0-100
}

/**
 * Extracts text from an uploaded image using Tesseract.js, no cloud OCR account required.
 * Proves the OCR-to-LLM-extraction pipeline shape; a production deployment handling real
 * handwriting or non-English text would swap this for Google Document AI or AWS Textract at
 * this exact seam, the rest of the pipeline (classifyTicket, confidence-based review flagging)
 * doesn't change.
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  // Held as a promise, not awaited into a variable: if the timeout below wins while the worker is
  // still starting up (the exact hang this guards against), `finally` can still find it and shut
  // it down whenever it does come up, instead of leaving a stuck thread behind.
  const workerPromise = createWorker("eng");
  let timer: ReturnType<typeof setTimeout> | undefined;

  const recognise = async (): Promise<OCRResult> => {
    const worker = await workerPromise;
    const result = await worker.recognize(imageBuffer);
    const text = result.data.text.trim();
    if (!text) {
      throw new OCRError("No text could be extracted from this image.");
    }
    return { text, confidence: result.data.confidence / 100 };
  };

  // A worker that fails to start (or hangs downloading its language data) would otherwise leave
  // the request open until the platform kills it, with the person staring at a spinner. Fail with
  // a message instead.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OCRError("Reading the image took too long. Try a smaller or clearer photo.")),
      OCR_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([recognise(), timeout]);
  } finally {
    clearTimeout(timer);
    workerPromise.then((worker) => worker.terminate()).catch(() => {});
  }
}
