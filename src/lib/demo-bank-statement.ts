export const demoBankStatement = {
  accountHolder: 'Rohan Mehta',
  accountName: 'Main current account',
  accountNumber: '•••• 4821',
  period: '1–30 September 2026',
  currency: 'AED' as const,
  openingBalance: 90_000,
  closingBalance: 79_450,
  transactions: [
    { date: '01 Sep', description: 'Rent cheque (Q4)', debit: 18_000, credit: null, balance: 72_000, status: 'actual' },
    { date: '01 Sep', description: 'School term fees', debit: 12_000, credit: null, balance: 60_000, status: 'actual' },
    { date: '05 Sep', description: 'Car loan installment', debit: 2_300, credit: null, balance: 57_700, status: 'forecasted' },
    { date: '10 Sep', description: 'DEWA', debit: 450, credit: null, balance: 57_250, status: 'pending' },
    { date: '15 Sep', description: 'Groceries & essentials', debit: 2_200, credit: null, balance: 55_050, status: 'forecasted' },
    { date: '20 Sep', description: 'Credit card minimum', debit: 600, credit: null, balance: 54_450, status: 'pending' },
    { date: '25 Sep', description: 'Salary', debit: null, credit: 25_000, balance: 79_450, status: 'forecasted' },
  ],
} as const;
