import { useState, useRef, useCallback } from 'react';
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
  const prevValueRef = useRef(value);

  // 외부 value가 변경되면 localValue 초기화 (focusing 중이 아닐 때만)
  if (!isFocused && prevValueRef.current !== value) {
    prevValueRef.current = value;
  }

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
