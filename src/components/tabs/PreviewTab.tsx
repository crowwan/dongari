import { useRef } from 'react';
import type { AccountingData } from '../../types/accounting';
import { ReportPreview } from '../report/ReportPreview';
import { exportToImage } from '../../utils/imageExport';

interface PreviewTabProps {
  data: AccountingData;
}

export function PreviewTab({ data }: PreviewTabProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (reportRef.current) {
      const filename = `${data.basicInfo.year}년_${data.basicInfo.clubName || '동아리'}_회계보고서.png`;
      await exportToImage(reportRef.current, filename);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">미리보기</h2>

      <div className="overflow-auto border border-gray-200 rounded-lg">
        <ReportPreview ref={reportRef} data={data} />
      </div>

      <button
        onClick={handleExport}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <span>이미지로 저장</span>
      </button>
    </div>
  );
}
