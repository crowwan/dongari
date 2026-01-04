import { useState, useEffect } from 'react';
import { formatNumber, parseNumber } from '../../utils/formatters';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
}

export function NumberInput({ value, onChange, placeholder = '0', className = '' }: NumberInputProps) {
  const [displayValue, setDisplayValue] = useState(value === 0 ? '' : formatNumber(value));

  useEffect(() => {
    setDisplayValue(value === 0 ? '' : formatNumber(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const numericValue = parseNumber(inputValue);

    setDisplayValue(numericValue === 0 ? '' : formatNumber(numericValue));
    onChange(numericValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    />
  );
}
