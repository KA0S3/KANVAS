/**
 * Currency Conversion Utility
 * 
 * Converts ZAR prices to user's local currency using exchange rates.
 * Caches rates for 24 hours to minimize API calls.
 */

interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

const CACHE_KEY = 'exchange_rates';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const BASE_CURRENCY = 'ZAR';

// Common currency symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ZAR: 'R',
  AUD: 'A$',
  CAD: 'C$',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  NGN: '₦',
  KES: 'KSh',
  GHS: '₵',
};

/**
 * Get user's currency from browser locale
 */
export function getUserCurrency(): string {
  const locale = navigator.language || (navigator as any).userLanguage || 'en-US';
  const currencyCode = locale.split('-')[1] || 'USD';
  
  // Map some common locales to currencies
  const localeToCurrency: Record<string, string> = {
    'US': 'USD',
    'GB': 'GBP',
    'EU': 'EUR',
    'ZA': 'ZAR',
    'AU': 'AUD',
    'CA': 'CAD',
    'JP': 'JPY',
    'CN': 'CNY',
    'IN': 'INR',
    'NG': 'NGN',
    'KE': 'KES',
    'GH': 'GHS',
  };
  
  return localeToCurrency[currencyCode] || currencyCode;
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Fetch exchange rates from free API
 */
async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    // Using exchangerate-api.com (free tier, no API key required)
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`);
    
    if (!response.ok) {
      console.warn('[currency] Failed to fetch exchange rates:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    return {
      base: data.base,
      rates: data.rates,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[currency] Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * Get cached exchange rates or fetch new ones
 */
async function getExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: ExchangeRates = JSON.parse(cached);
      const age = Date.now() - data.timestamp;
      
      if (age < CACHE_DURATION) {
        console.log('[currency] Using cached exchange rates');
        return data;
      }
    }
    
    console.log('[currency] Fetching fresh exchange rates');
    const rates = await fetchExchangeRates();
    
    if (rates) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
    }
    
    return rates;
  } catch (error) {
    console.error('[currency] Error getting exchange rates:', error);
    return null;
  }
}

/**
 * Convert amount from ZAR to target currency
 */
export async function convertFromZAR(amountZAR: number, targetCurrency: string): Promise<number | null> {
  if (targetCurrency === BASE_CURRENCY) {
    return amountZAR;
  }
  
  const rates = await getExchangeRates();
  
  if (!rates || !rates.rates[targetCurrency]) {
    console.warn(`[currency] No exchange rate for ${targetCurrency}`);
    return null;
  }
  
  const converted = amountZAR * rates.rates[targetCurrency];
  return converted;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Get display price with both ZAR and local currency
 */
export async function getDisplayPrice(amountZAR: number): Promise<{
  basePrice: string;
  convertedPrice?: string;
  currency: string;
}> {
  const userCurrency = getUserCurrency();
  const basePrice = formatPrice(amountZAR, BASE_CURRENCY);
  
  if (userCurrency === BASE_CURRENCY) {
    return { basePrice, currency: BASE_CURRENCY };
  }
  
  const converted = await convertFromZAR(amountZAR, userCurrency);
  
  if (converted === null) {
    return { basePrice, currency: BASE_CURRENCY };
  }
  
  const convertedPrice = formatPrice(converted, userCurrency);
  
  return {
    basePrice,
    convertedPrice,
    currency: userCurrency,
  };
}

/**
 * Force refresh exchange rates (call this if you want to update rates manually)
 */
export async function refreshExchangeRates(): Promise<void> {
  localStorage.removeItem(CACHE_KEY);
  await getExchangeRates();
}
