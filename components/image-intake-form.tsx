"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImageUp, Upload } from "lucide-react";
import { processImageIntake } from "@/app/(app)/intake/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes, prepareImageForUpload } from "@/lib/image-client";

export function ImageIntakeForm() {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<"preparing" | "reading">("preparing");
  const [problem, setProblem] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs hold the whole image in memory until revoked.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  function choose(file: File | null | undefined) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setProblem(null);
    if (!file) {
      setSelected(null);
      setPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSelected(null);
      setPreview(null);
      setProblem("That doesn't look like an image. Choose a JPEG, PNG, or WebP photo.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    previewRef.current = URL.createObjectURL(file);
    setSelected(file);
    setPreview(previewRef.current);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setProblem("Choose an image to upload.");
      return;
    }
    setProblem(null);
    startTransition(async () => {
      try {
        setStage("preparing");
        const prepared = await prepareImageForUpload(selected);
        setStage("reading");
        const formData = new FormData();
        formData.set("image", prepared);
        const result = await processImageIntake(formData);
        if (result.error) {
          setProblem(result.error);
          return;
        }
        toast.success("Image processed — a ticket was created from the extracted text.");
        choose(null);
        if (inputRef.current) inputRef.current.value = "";
      } catch {
        // Network failure, or a request the platform rejected before our action ran.
        setProblem("The upload didn't go through. Check your connection and try again with a smaller image.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <label
            htmlFor="intake-image"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                choose(file);
                if (inputRef.current) inputRef.current.value = "";
              }
            }}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-input px-4 py-8 text-center transition-colors hover:bg-muted/50 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          >
            <ImageUp className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">
              {selected ? selected.name : "Choose a photo or screenshot"}
            </span>
            <span className="text-xs text-muted-foreground">
              {selected
                ? `${formatBytes(selected.size)} — click to choose a different one`
                : "JPEG, PNG, or WebP. Large photos are shrunk in your browser before upload."}
            </span>
            <input
              id="intake-image"
              ref={inputRef}
              type="file"
              name="image"
              accept="image/*"
              onChange={(e) => choose(e.target.files?.[0])}
              className="sr-only"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            A photo of a handwritten work order note or similar. The extracted text runs through the same AI
            classification as a typed ticket.
          </p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview of the selected upload" className="max-h-64 rounded-md border object-contain" />
          ) : null}
          <FormError>{problem}</FormError>
          <Button type="submit" disabled={isPending || !selected}>
            <Upload className="size-3.5" aria-hidden />
            {isPending ? (stage === "preparing" ? "Preparing image…" : "Extracting text…") : "Upload and process"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
