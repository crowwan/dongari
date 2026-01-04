import { useState, useCallback } from 'react';
import { formatNumber, parseNumber } from '../../utils/formatters';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
}

export function NumberInput({ value, onChange, placeholder = '0', className = '' }: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState('');

  // 표시할 값 결정: 포커스 중이면 로컬 값, 아니면 외부 값
  const displayValue = isFocused
    ? localValue
    : value === 0
      ? ''
      : formatNumber(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const numericValue = parseNumber(inputValue);
    const formatted = numericValue === 0 ? '' : formatNumber(numericValue);

    setLocalValue(formatted);
    onChange(numericValue);
  }, [onChange]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLocalValue(value === 0 ? '' : formatNumber(value));
    e.target.select();
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    />
  );
}
