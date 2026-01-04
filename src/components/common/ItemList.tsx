import { useState } from 'react';
import { NumberInput } from './NumberInput';
import { formatNumber } from '../../utils/formatters';

interface Item {
  id: string;
  name: string;
  amount: number;
}

interface ItemListProps {
  items: Item[];
  onAdd: (item: { name: string; amount: number }) => void;
  onUpdate: (id: string, updates: { name?: string; amount?: number }) => void;
  onRemove: (id: string) => void;
}

export function ItemList({ items, onAdd, onUpdate, onRemove }: ItemListProps) {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState(0);

  const handleAdd = () => {
    if (newName.trim() && newAmount > 0) {
      onAdd({ name: newName.trim(), amount: newAmount });
      setNewName('');
      setNewAmount(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
          <input
            type="text"
            value={item.name}
            onChange={e => onUpdate(item.id, { name: e.target.value })}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
          />
          <div className="w-28">
            <NumberInput
              value={item.amount}
              onChange={amount => onUpdate(item.id, { amount })}
              className="text-sm py-1"
            />
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-100 rounded"
          >
            ✕
          </button>
        </div>
      ))}

      {/* 새 항목 추가 */}
      <div className="flex items-center gap-2 p-2 border-2 border-dashed border-gray-300 rounded-lg">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="항목명"
          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <div className="w-28">
          <NumberInput
            value={newAmount}
            onChange={setNewAmount}
            placeholder="금액"
            className="text-sm py-1"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || newAmount <= 0}
          className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>

      {items.length > 0 && (
        <div className="text-right text-sm text-gray-600 pr-12">
          합계: {formatNumber(items.reduce((sum, item) => sum + item.amount, 0))}원
        </div>
      )}
    </div>
  );
}
