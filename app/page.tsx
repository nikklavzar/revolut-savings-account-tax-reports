import { FileUpload } from '@/components/file-upload';
import { ThemeProvider } from '@/components/theme-provider';
import { EligibilityCheck } from '@/components/eligibility-check';
import { InstructionsAccordion } from '@/components/instructions-accordion';

export default function Home() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-center mb-2">
              FURS & Revolut Saving Accounts
            </h1>
            <h2 className="text-xl text-center text-muted-foreground mb-6">
              Priprava davčnih obrazcev za leto 2024
            </h2>
            
            <EligibilityCheck />
            
            <div className="bg-card rounded-lg shadow-md p-6 mt-8">
              <h2 className="text-xl font-semibold mb-4">Navodila za uporabo</h2>
              <InstructionsAccordion />
            </div>
          </div>
        </div>
      </main>
    </ThemeProvider>
  );
}