import { forwardRef } from 'react';
import type { AccountingData } from '../../types/accounting';
import { IncomeExpenseTable } from './IncomeExpenseTable';
import { SummaryBox } from './SummaryBox';
import { ExpenseDetailTable } from './ExpenseDetailTable';

interface ReportPreviewProps {
  data: AccountingData;
}

// html2canvas가 oklch 색상을 지원하지 않으므로 인라인 스타일 사용
const styles = {
  container: {
    width: '360px',
    padding: '16px',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  section: {
    marginBottom: '24px',
  },
  title: {
    textAlign: 'center' as const,
    fontWeight: 'bold',
    fontSize: '14px',
    marginBottom: '12px',
  },
  flexContainer: {
    display: 'flex',
    gap: '16px',
  },
  summaryContainer: {
    width: '128px',
  },
};

export const ReportPreview = forwardRef<HTMLDivElement, ReportPreviewProps>(
  ({ data }, ref) => {
    const { basicInfo } = data;

    return (
      <div ref={ref} style={styles.container}>
        {/* 상단: 수입 지출 내역 */}
        <div style={styles.section}>
          <h2 style={styles.title}>
            &lt;{basicInfo.year}년 {basicInfo.clubName} 수입 지출 내역&gt;
          </h2>
          <div style={styles.flexContainer}>
            <div style={{ flex: 1 }}>
              <IncomeExpenseTable monthlyData={data.monthlyData} />
            </div>
            <div style={styles.summaryContainer}>
              <SummaryBox data={data} />
            </div>
          </div>
        </div>

        {/* 하단: 지출 내역 */}
        <div>
          <h2 style={styles.title}>
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
