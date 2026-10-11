import { LoadingState } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <LoadingState label="Loading..." />
    </div>
  );
}
