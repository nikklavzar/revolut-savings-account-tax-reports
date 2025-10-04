"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, FileText, Download, AlertCircle, FileCode, Info, CheckCircle2, HelpCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Papa from 'papaparse'
import { parseTransactions, type FundTransactions } from '@/lib/revolut-parser'
import { generateReport, formatNumber, calculateFundSummary } from '@/lib/report-generator'
import { generateAllTaxXMLs, generateFullDohKDVPXML, generateTaxOfficeXml } from '@/lib/tax-generator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface FileUploadProps {
  taxYear: number
  onRestart: () => void
}

interface ExcludedCounts {
  orders: number
  interest: number
}

function filterTransactionsByYear(
  transactions: FundTransactions[],
  taxYear: number
) {
  let excludedOrders = 0
  let excludedInterest = 0

  const filteredTransactions = transactions
    .map((fund) => {
      const orders = fund.orders.filter((order) => order.date.getFullYear() === taxYear)
      const interestPayments = fund.interest_payments.filter(
        (payment) => payment.date.getFullYear() === taxYear
      )

      excludedOrders += fund.orders.length - orders.length
      excludedInterest += fund.interest_payments.length - interestPayments.length

      return {
        ...fund,
        orders,
        interest_payments: interestPayments,
      }
    })
    .filter((fund) => fund.orders.length > 0 || fund.interest_payments.length > 0)

  return {
    filteredTransactions,
    excludedOrders,
    excludedInterest,
  }
}

export function FileUpload({ taxYear, onRestart }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [parsedData, setParsedData] = useState<FundTransactions[] | null>(null)
  const [taxNumber, setTaxNumber] = useState<string>("")
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false)
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    downloadUrl?: string;
    fileName?: string;
    taxXMLs?: Record<string, string>;
  } | null>(null)
  const [excludedCounts, setExcludedCounts] = useState<ExcludedCounts>({ orders: 0, interest: 0 })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
      setParsedData(null)
      setExcludedCounts({ orders: 0, interest: 0 })
    }
  }

  const handleProcessFile = () => {
    setShowDisclaimerModal(true)
  }

  const processFile = async () => {
    if (!file) return

    setIsProcessing(true)
    setProgress(0)
    setResult(null)
    setParsedData(null)
    setShowDisclaimerModal(false)

    try {
      // Parse the CSV file using Papa Parse
      Papa.parse(file, {
        header: false, // returns an array of arrays
        complete: async (results) => {
          try {
            // Update progress to 20%
            setProgress(20)
            
            // Parse the transactions using our custom parser
            const data = results.data as string[][]
            const transactions = await parseTransactions(data)
            const { filteredTransactions, excludedOrders, excludedInterest } =
              filterTransactionsByYear(transactions, taxYear)
            
            // Log the parsed transactions to the console
            console.log('Parsed transactions:', transactions)
            console.log(`Filtered transactions for tax year ${taxYear}:`, filteredTransactions)
            setParsedData(filteredTransactions)
            setExcludedCounts({ orders: excludedOrders, interest: excludedInterest })
            
            // Update progress to 60%
            setProgress(60)
            
            // Generate a report from the transactions
            await new Promise(resolve => setTimeout(resolve, 500))
            setProgress(80)
            
            // Generate tax XML files
            const taxXMLs = generateAllTaxXMLs(filteredTransactions, taxYear)
            
            // Generate the report using the separate function
            const reportText = generateReport(filteredTransactions)
            
            // Create a blob for download
            const blob = new Blob([reportText], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            
            // Update progress to 100%
            setProgress(100)
            
            // Check if any XML files were generated
            const hasXmlFiles = Object.keys(taxXMLs).length > 0;
            
            if (hasXmlFiles) {
              setResult({
                success: true,
                message: "Davčni obrazci so bili uspešno pripravljeni!",
                downloadUrl: url,
                fileName: "davcni_obrazci_revolut.txt",
                taxXMLs
              });
            } else {
              const noTransactionsMessage = filteredTransactions.length === 0
                ? `Ni bilo mogoče generirati XML datotek. V datoteki ni bilo najdenih transakcij za leto ${taxYear}.`
                : "Ni bilo mogoče generirati XML datotek. V datoteki ni bilo najdenih ustreznih transakcij."
              setResult({
                success: false,
                message: noTransactionsMessage,
                downloadUrl: url,
                fileName: "davcni_obrazci_revolut.txt"
              });
            }
          } catch (error) {
            console.error('Error processing transactions:', error)
            setResult({
              success: false,
              message: "Prišlo je do napake pri obdelavi transakcij. Format datoteke morda ni pravilen."
            })
          } finally {
            setIsProcessing(false)
          }
        },
        error: (error) => {
          console.error('Error parsing CSV:', error)
          setResult({
            success: false,
            message: "Prišlo je do napake pri obdelavi datoteke. Prosimo, preverite format Excel (CSV) datoteke."
          })
          setIsProcessing(false)
        }
      })
    } catch (error) {
      console.error('Error processing file:', error)
      setResult({
        success: false,
        message: "Prišlo je do napake pri obdelavi datoteke. Prosimo, preverite format Excel (CSV) datoteke."
      })
      setIsProcessing(false)
    }
  }

  const downloadTaxXML = (xmlKey: string, fileName: string) => {
    if (!parsedData || !taxNumber || !result?.taxXMLs?.[xmlKey]) return;
    
    const year = taxYear;
    let xmlContent = "";
    
    // Generate the appropriate XML based on the key
    if (xmlKey === "kdvp") {
      const fundsWithOrders = parsedData.filter(fund => fund.orders.length > 0);
      if (fundsWithOrders.length > 0) {
        xmlContent = generateFullDohKDVPXML(fundsWithOrders, year, taxNumber);
      }
    } else if (xmlKey === "interest") {
      const fundsWithInterest = parsedData.filter(fund => fund.interest_payments.length > 0);
      if (fundsWithInterest.length > 0) {
        xmlContent = generateTaxOfficeXml(fundsWithInterest, year, taxNumber);
      }
    }
    
    if (!xmlContent) return;
    
    const blob = new Blob([xmlContent], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const resetForm = () => {
    setFile(null)
    setResult(null)
    setParsedData(null)
    setProgress(0)
    setTaxNumber("")
    setExcludedCounts({ orders: 0, interest: 0 })
  }

  const isValidTaxNumber = (num: string) => {
    // Slovenian tax number is 8 digits
    return /^\d{8}$/.test(num);
  }

  const hasXMLFiles = result?.success && result?.taxXMLs && Object.keys(result.taxXMLs).length > 0;
  const excludedTotal = excludedCounts.orders + excludedCounts.interest;
  const excludedDescription = excludedTotal > 0
    ? `Iz obdelave smo odstranili ${excludedTotal} transakcij (nakupi/prodaje: ${excludedCounts.orders}, obresti: ${excludedCounts.interest}), ker ne spadajo v davčno leto ${taxYear}.`
    : '';

  return (
    <>
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Davčno leto: {taxYear}
            </span>
          </div>

          {/* Only show title and subtitle if we don't have successful XML generation */}
          {!hasXMLFiles && (
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Naložite Excel (v CSV formatu) datoteko</h2>
              <p className="text-muted-foreground">
                Izberite izvoženo Excel datoteko iz vašega Revolut računa
              </p>
            </div>
          )}

          {!file && !result && (
            <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="mb-4 text-muted-foreground">
                Povlecite in spustite Excel (v CSV formatu) datoteko ali kliknite za izbiro
              </p>
              <input
                type="file"
                id="file-upload"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button onClick={() => document.getElementById('file-upload')?.click()}>
                Izberite datoteko
              </Button>
            </div>
          )}

          {file && !isProcessing && !result && (
            <div className="space-y-4">
              <div className="flex items-center p-4 bg-muted rounded-md">
                <FileText className="h-6 w-6 mr-3 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Odstrani
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tax-number">Davčna številka</Label>
                  <Input 
                    id="tax-number" 
                    placeholder="Vnesite 8-mestno davčno številko" 
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className={!taxNumber || isValidTaxNumber(taxNumber) ? "" : "border-red-500"}
                  />
                  {taxNumber && !isValidTaxNumber(taxNumber) && (
                    <p className="text-xs text-red-500">Davčna številka mora vsebovati 8 številk</p>
                  )}
                </div>
                
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">Davčna številka</AlertTitle>
                  <AlertDescription className="text-blue-700">
                    Davčna številka je potrebna za generiranje XML datoteke za davčno upravo. Podatki se obdelujejo izključno lokalno v vašem brskalniku.
                  </AlertDescription>
                </Alert>
              </div>
              
              <Button 
                className="w-full" 
                onClick={handleProcessFile}
                disabled={!!taxNumber && !isValidTaxNumber(taxNumber)}
              >
                Obdelaj datoteko
              </Button>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-4">
              <p className="text-center font-medium">Obdelava datoteke...</p>
              <Progress value={progress} className="h-2" />
              <p className="text-center text-sm text-muted-foreground">
                {progress}% končano
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
          {result.success ? (
            <>
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <AlertTitle className="text-green-800 text-lg">Uspešno!</AlertTitle>
                <AlertDescription className="text-green-700">
                  {result.message}
                </AlertDescription>
              </Alert>

              {excludedTotal > 0 && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 text-sm">Nekaj podatkov je bilo izločenih</AlertTitle>
                  <AlertDescription className="text-amber-700 text-sm">
                    {excludedDescription}
                  </AlertDescription>
                </Alert>
              )}
              
              {/* XML files section - made more prominent */}
              {result.taxXMLs && Object.keys(result.taxXMLs).length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                  <h3 className="text-lg font-semibold mb-3 text-blue-800">
                    Datoteke za oddajo na eDavki:
                  </h3>
                      
                      <div className="grid gap-3">
                        {result.taxXMLs["kdvp"] && (
                          <Button 
                            size="lg"
                            className="w-full flex justify-between items-center bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 hover:border-blue-400 shadow-sm"
                            onClick={() => downloadTaxXML("kdvp", `Doh_KDVP_Revolut_${taxYear}.xml`)}
                            disabled={!isValidTaxNumber(taxNumber)}
                          >
                            <span className="flex items-center">
                              <FileCode className="mr-3 h-5 w-5 text-blue-600" />
                              <span className="text-base font-medium">
                                {`Doh_KDVP_Revolut_${taxYear}.xml`}
                              </span>
                            </span>
                            <Download className="h-5 w-5 text-blue-600" />
                          </Button>
                        )}
                        
                        {result.taxXMLs["interest"] && (
                          <Button 
                            size="lg"
                            className="w-full flex justify-between items-center bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 hover:border-blue-400 shadow-sm"
                            onClick={() => downloadTaxXML("interest", `Doh_Obr_Revolut_${taxYear}.xml`)}
                            disabled={!isValidTaxNumber(taxNumber)}
                          >
                            <span className="flex items-center">
                              <FileCode className="mr-3 h-5 w-5 text-blue-600" />
                              <span className="text-base font-medium">
                                {`Doh_Obr_Revolut_${taxYear}.xml`}
                              </span>
                            </span>
                            <Download className="h-5 w-5 text-blue-600" />
                          </Button>
                        )}
                      </div>
                      
                      <div className="mt-3 flex items-start space-x-2 text-sm">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-blue-700">
                          XML datoteke so generirane za davčno leto {taxYear} z vašo davčno številko ({taxNumber}). 
                          Te datoteke lahko neposredno uvozite v sistem eDavki. Po uvozu nujno preverite pravilnost podatkov
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Summary section - now below XML files */}
                  {parsedData && parsedData.length > 0 && (
                    <div className="bg-muted p-4 rounded-md">
                      <h3 className="font-medium mb-3">Povzetek obdelanih podatkov:</h3>
                      
                      {parsedData.map((fund, index) => {
                        const summary = calculateFundSummary(fund);
                        const taxObligation = summary.totalInterestAmount * 0.25; // 25% tax on interest
                        
                        return (
                          <div key={index} className="mb-4">
                            <h4 className="font-medium text-sm mb-2">
                              Valuta: {fund.currency} 
                              {fund.isin && <span className="ml-2 text-muted-foreground">ISIN: {fund.isin}</span>}
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted-foreground/10">
                                    <th className="text-left py-2 px-3 font-medium">Tip</th>
                                    <th className="text-right py-2 px-3 font-medium">Znesek</th>
                                    <th className="text-right py-2 px-3 font-medium">Znesek (EUR)</th>
                                    <th className="text-right py-2 px-3 font-medium">Št. transakcij</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-b border-muted-foreground/20">
                                    <td className="py-2 px-3">Nakupi</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalBuyAmount)} {fund.currency}</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalBuyAmountEur)} EUR</td>
                                    <td className="py-2 px-3 text-right text-muted-foreground">{summary.buyTransactions.length}</td>
                                  </tr>
                                  <tr className="border-b border-muted-foreground/20">
                                    <td className="py-2 px-3">Prodaje</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalSellAmount)} {fund.currency}</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalSellAmountEur)} EUR</td>
                                    <td className="py-2 px-3 text-right text-muted-foreground">{summary.sellTransactions.length}</td>
                                  </tr>
                                  <tr className="border-b border-muted-foreground/20">
                                    <td className="py-2 px-3">Obresti</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalInterestAmount)} {fund.currency}</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalInterestAmountEur)} EUR</td>
                                    <td className="py-2 px-3 text-right text-muted-foreground">{fund.interest_payments.length}</td>
                                  </tr>
                                  <tr className="bg-amber-50/50">
                                    <td className="py-2 px-3 font-medium">Davčna obveznost (25%)</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(taxObligation)} {fund.currency}</td>
                                    <td className="py-2 px-3 text-right font-bold">{formatNumber(summary.totalInterestAmountEur * 0.25)} EUR</td>
                                    <td className="py-2 px-3 text-right"></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  <Button variant="outline" className="w-full" onClick={resetForm}>
                    Začni znova
                  </Button>
                </>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Napaka</AlertTitle>
                <AlertDescription>
                  {result.message}
                </AlertDescription>
              </Alert>

              {excludedTotal > 0 && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 text-sm">Nekaj podatkov je bilo izločenih</AlertTitle>
                  <AlertDescription className="text-amber-700 text-sm">
                    {excludedDescription}
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Special error message for when no XML files were generated */}
              {result.message.includes("Ni bilo mogoče generirati XML datotek") && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                  <div className="flex space-x-3">
                        <HelpCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2">
                        <h3 className="font-medium text-amber-800">Ali ste uporabili &quot;Consolidated statement&quot;?</h3>
                          <p className="text-amber-700">
                            Preverite, ali ste izvozili podatke z uporabo &quot;Consolidated statement&quot; kot je navedeno v navodilih:
                          </p>
                          <ol className="list-decimal pl-5 space-y-1 text-amber-700">
                            <li>V Revolut aplikaciji kliknite na ikono profila</li>
                            <li>Izberite <b>Documents & statements &gt; Consolidated statement</b></li>
                            <li>Izberite format &quot;Excel&quot;, obdobje &quot;Tax Year&quot; in ustrezno leto ({taxYear})</li>
                            <li>Če uporabljate več Revolut storitev, nastavite filter na &quot;Savings & funds&quot;</li>
                          </ol>
                          <p className="text-amber-700 font-medium">
                            Če ste uporabili drug način izvoza, podatki morda niso v pravilnem formatu.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button variant="outline" className="w-full" onClick={resetForm}>
                    Poskusi znova
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={showDisclaimerModal} onOpenChange={setShowDisclaimerModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uporaba na lastno odgovornost</DialogTitle>
            <DialogDescription className="pt-4">
              Orodje je zgolj v pomoč pri oddaji davčne napovedi - avtor ne prevzema nobene odgovornosti za pravilnost podatkov ali obrazcev.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisclaimerModal(false)}>Prekliči</Button>
            <Button onClick={processFile}>Razumem in želim nadaljevati</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-4 flex justify-center">
        <Button variant="ghost" onClick={() => {
          resetForm()
          onRestart()
        }}>
          Zamenjaj davčno leto
        </Button>
      </div>
    </>
  )
}
