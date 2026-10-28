import { createWorker } from "tesseract.js";

export class OCRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OCRError";
  }
}

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
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(imageBuffer);
    const text = result.data.text.trim();
    if (!text) {
      throw new OCRError("No text could be extracted from this image.");
    }
    return {
      text,
      confidence: result.data.confidence / 100,
    };
  } finally {
    await worker.terminate();
  }
}
