import { forwardRef } from 'react';
import type { AccountingData } from '../../types/accounting';
import { IncomeExpenseTable } from './IncomeExpenseTable';
import { SummaryBox } from './SummaryBox';
import { ExpenseDetailTable } from './ExpenseDetailTable';

interface ReportPreviewProps {
  data: AccountingData;
}

export const ReportPreview = forwardRef<HTMLDivElement, ReportPreviewProps>(
  ({ data }, ref) => {
    const { basicInfo } = data;

    return (
      <div ref={ref} className="bg-white p-4 space-y-6" style={{ width: '360px' }}>
        {/* 상단: 수입 지출 내역 */}
        <div>
          <h2 className="text-center font-bold text-sm mb-3">
            &lt;{basicInfo.year}년 {basicInfo.clubName} 수입 지출 내역&gt;
          </h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <IncomeExpenseTable monthlyData={data.monthlyData} />
            </div>
            <div className="w-32">
              <SummaryBox data={data} />
            </div>
          </div>
        </div>

        {/* 하단: 지출 내역 */}
        <div>
          <h2 className="text-center font-bold text-sm mb-3">
            &lt;{basicInfo.year}년 {basicInfo.clubName} 지출내역&gt;
          </h2>
          <ExpenseDetailTable
            monthlyData={data.monthlyData}
            incomeItems={data.incomeItems}
          />
        </div>
      </div>
    );
  }
);

ReportPreview.displayName = 'ReportPreview';
