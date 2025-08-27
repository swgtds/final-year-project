import { ShieldCheck } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="bg-card border-b border-border shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
        <ShieldCheck className="h-8 w-8 text-primary mr-3" />
        <h1 className="text-2xl font-headline font-semibold text-foreground">
          BorderWatch AI
        </h1>
      </div>
    </header>
  );
}
