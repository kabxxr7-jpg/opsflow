"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { processImageIntake } from "@/app/(app)/intake/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ImageIntakeForm() {
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await processImageIntake(formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Image processed, ticket created from the extracted text.");
              formRef.current?.reset();
              setPreview(null);
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              name="image"
              accept="image/*"
              required
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPreview(URL.createObjectURL(file));
                } else {
                  setPreview(null);
                }
              }}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <p className="text-xs text-muted-foreground">
              A photo of a handwritten work order note or similar. Extracted text runs through
              the same AI classification as a typed ticket.
            </p>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected upload preview" className="max-h-64 rounded-md border object-contain" />
          ) : null}
          <Button type="submit" disabled={isPending}>
            <Upload className="size-3.5" />
            {isPending ? "Extracting text..." : "Upload and process"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
