import { Loader2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center min-h-[50vh]">
      <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
