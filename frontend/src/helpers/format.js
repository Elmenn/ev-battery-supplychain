// helpers/format.js
import { formatUnits } from 'ethers';

export const fmt18 = (v) => {
  // v might be undefined | number | string | bigint
  if (v === undefined || v === null) return '0';
  if (typeof v === 'bigint') return formatUnits(v, 18);
  if (typeof v === 'string') return v;       // already formatted
  if (typeof v === 'number') return String(v);
  try { 
    return formatUnits(BigInt(v), 18); 
  } catch { 
    return '0'; 
  }
};

export const fmtUnits = (value, decimals) => {
  if (value === undefined || value === null) return '0';
  if (typeof value === 'bigint') return formatUnits(value, decimals);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  try { 
    return formatUnits(BigInt(value), decimals); 
  } catch { 
    return '0'; 
  }
};
