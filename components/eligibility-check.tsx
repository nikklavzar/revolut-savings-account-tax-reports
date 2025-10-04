"use client"

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/file-upload'
import { Info } from 'lucide-react'

const SUPPORTED_TAX_YEARS = [2024, 2023] as const;

type SupportedTaxYear = (typeof SUPPORTED_TAX_YEARS)[number];

export function EligibilityCheck() {
  const [isChecked, setIsChecked] = useState(false)
  const [taxYear, setTaxYear] = useState<SupportedTaxYear>(SUPPORTED_TAX_YEARS[0])

  const taxYearOptions = useMemo(() => SUPPORTED_TAX_YEARS, [])
  
  const handleCheck = () => {
    setIsChecked(true)
  }
  
  return (
    <div>
      {!isChecked ? (
        <Card className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Izberite davčno leto</h2>
              <p className="text-muted-foreground">
                Orodje podpira pripravo obrazcev za davčni leti 2023 in 2024.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-year" className="text-base font-medium">
                Davčno leto
              </Label>
              <select
                id="tax-year"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={taxYear}
                onChange={(event) => setTaxYear(Number(event.target.value) as SupportedTaxYear)}
              >
                {taxYearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-center">
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center space-x-2 mb-1">
                  <Info className="h-4 w-4 text-blue-600" />
                  <p className="text-blue-800 font-medium">Zasebnost</p>
                </div>
                <p className="text-blue-700">
                  Vsi podatki se obdelujejo izključno lokalno v vašem brskalniku. <br />
                  Podatki se ne pošiljajo na strežnik ali kakorkoli shranjujejo.
                </p>
              </div>
            </div>

            <Button className="w-full" onClick={handleCheck}>
              Nadaljuj
            </Button>
          </div>
        </Card>
      ) : (
        <FileUpload taxYear={taxYear} onRestart={() => {
          setIsChecked(false)
        }} />
      )}
    </div>
  )
}
