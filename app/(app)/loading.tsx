import { GenericPageSkeleton } from "@/components/page-skeletons";

// Fallback for any route that doesn't define its own loading.tsx.
export default function Loading() {
  return <GenericPageSkeleton />;
}
