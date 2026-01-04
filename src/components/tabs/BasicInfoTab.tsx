import type { BasicInfo } from '../../types/accounting';
import { NumberInput } from '../common/NumberInput';

interface BasicInfoTabProps {
  basicInfo: BasicInfo;
  onUpdate: (updates: Partial<BasicInfo>) => void;
}

export function BasicInfoTab({ basicInfo, onUpdate }: BasicInfoTabProps) {
  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <span>기본 정보</span>
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            연도
          </label>
          <input
            type="number"
            value={basicInfo.year}
            onChange={e => onUpdate({ year: parseInt(e.target.value) || new Date().getFullYear() })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            동아리명
          </label>
          <input
            type="text"
            value={basicInfo.clubName}
            onChange={e => onUpdate({ clubName: e.target.value })}
            placeholder="동아리 이름을 입력하세요"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            전년도 이월금
          </label>
          <NumberInput
            value={basicInfo.carryover}
            onChange={carryover => onUpdate({ carryover })}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
